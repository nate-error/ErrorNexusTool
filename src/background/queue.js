// Settings
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60000;

let delayMs = DEFAULT_DELAY_MS;

async function loadDelay() {
    const { requestDelay } = await storageGet("local", { requestDelay: DEFAULT_DELAY_MS });
    const n = Number(requestDelay);
    delayMs = Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_DELAY_MS) : DEFAULT_DELAY_MS;
}

loadDelay();
browserAPI.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.requestDelay) loadDelay(); // applies immediately, even mid-scan
});

// Scans
const activeScans = new Map(); // tabId -> scan

function reportProgress(scan, active = true) {
    sendToTab(scan.tabId, { type: "progress", active, done: scan.done, total: scan.total });
}

// Called when a job ends (or when scanTab has finished queuing its first jobs)
function release(scan) {
    scan.pending--;
    if (scan.pending > 0)
        return;

    if (activeScans.get(scan.tabId) === scan) {
        activeScans.delete(scan.tabId);
        reportProgress(scan, false);
    }
}

// The queue
// job = { url, kind: "Image" | "Variant", options?, onResponse(res) }
const queue = [];
let working = false;
let nextAllowed = 0;

// Each URL is queued once per scan
function enqueue(scan, job) {
    if (scan.cancelled || scan.seen.has(job.url))
        return;

    scan.seen.add(job.url);
    scan.total++;
    scan.pending++;
    queue.push({ scan, ...job });
    reportProgress(scan);
    runWorker();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForSlot() {
    const wait = nextAllowed - Date.now();

    if (wait > 0)
        await sleep(wait);
}

// Push the next request back for everyone (used for 429 and errors)
// The tab gets a "throttle" message so the console can show a countdown instead of looking stuck
function backOff(scan, ms, why, short) {
    nextAllowed = Math.max(nextAllowed, Date.now() + ms);
    sendToTab(scan.tabId, { type: "throttle", until: nextAllowed, why: short });
    sendLog(scan.tabId, `${why}, pausing ${(ms / 1000).toFixed(1)}s`, "warn");
}

async function processJob(job) {
    const { scan } = job;
    let lastRes = null;
    let lastErr = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (scan.cancelled) return;
        await waitForSlot();
        if (scan.cancelled) return;

        let res;
        try {
            res = await fetch(job.url, job.options);
            lastErr = null;
        } catch (e) {
            lastErr = e;
            nextAllowed = Date.now() + delayMs;
            if (attempt < MAX_RETRIES)
                backOff(scan, BASE_BACKOFF_MS * 2 ** attempt, `Network error on ${job.url}`, "network error");
            
            continue;
        }

        nextAllowed = Date.now() + delayMs;
        lastRes = res;

        // rate limited or server issues: wait and retry
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
            const retryAfter = Number(res.headers.get("Retry-After")) * 1000;
            const wait = Math.min(retryAfter || BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
            backOff(scan, wait, `Status ${res.status}`, res.status === 429 ? "rate limited (429)" : `server error (${res.status})`);
            continue;
        }
        break;
    }

    if (lastErr) {
        sendLog(scan.tabId, `Error fetching ${job.url}: ${lastErr}`, "error");
        return;
    }
    try {
        await job.onResponse(lastRes);
    } catch (e) {
        sendLog(scan.tabId, `Error handling ${job.url}: ${e}`, "error");
    }
}

async function runWorker() {
    if (working)
        return;

    working = true;

    try {
        while (queue.length) {
            const job = queue.shift();
            try {
                if (!job.scan.cancelled)
                    await processJob(job);
            } finally {
                job.scan.done++;
                if (!job.scan.cancelled)
                    reportProgress(job.scan);

                release(job.scan);
            }
        }
    } finally {
        working = false;
    }
}