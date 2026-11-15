const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp"];
const METADATA_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

// shared by images and image variants: log the find, EXIF and EOF
// returns false if the response wasn't actually an image
async function reportImage(scan, kind, url, res) {
    const type = res.headers.get("Content-Type") || "";
    if (!type.startsWith("image/")) {
        // some sites answer 200 with an HTML page for missing files
        sendLog(scan.tabId, `${kind} found (not an image: ${type || "no content type"}): `, "found", url);
        return false;
    }

    const meta = extractMetadata(await res.arrayBuffer(), url);
    sendLog(scan.tabId, `${kind} found: `, "found", url);

    // stringify the metadata
    if (Object.keys(meta.exif || {}).length) {
        const lines = Object.entries(meta.exif).map(([k, v]) =>
            String(v).includes("\n") ? `${k}:\n${v}` : `${k}: ${v}`,
        );

        sendLog(scan.tabId, "EXIF:\n" + lines.join("\n"), "meta");
    } else sendLog(scan.tabId, "No EXIF data", "warn");

    sendLog(scan.tabId, "EOF OK: " + meta.eof, meta.eof ? "found" : "bad");

    return true;
}

// job builders
function queueVariants(scan, sourceUrl) {
    const u = new URL(sourceUrl);
    if (u.pathname.endsWith("/"))
        return; // no file name to swap the extension on

    u.search = "";
    u.hash = "";
    u.pathname = u.pathname.replace(/\.\w+$/, "");
    const base = u.href;

    for (const ext of scan.endings) {
        const url = `${base}.${ext}`;
        const isImage = METADATA_EXTS.has(ext);

        enqueue(scan, {
            url,
            kind: "Variant",
            options: isImage ? undefined : { method: "HEAD" }, // images need the full file
            onResponse: async (res) => {
                if (!res.ok)
                    return logFailure(scan.tabId, "Variant", url, res.status);

                if (isImage)
                    await reportImage(scan, "Variant", url, res);
                else
                    sendLog(scan.tabId, "Variant found: ", "found", url);
            },
        });
    }
}

function queueImage(scan, url) {
    enqueue(scan, {
        url,
        kind: "Image",
        onResponse: async (res) => {
            if (!res.ok)
                return logFailure(scan.tabId, "Image", url, res.status);

            // found images get the extensions.txt check too
            if (await reportImage(scan, "Image", url, res))
                queueVariants(scan, url);
        },
    });
}

async function scanTab(tabId, pageUrl, baseNames) {
    const prev = activeScans.get(tabId);
    if (prev)
        prev.cancelled = true; // page reloaded: stop the old scan

    const page = new URL(pageUrl);
    page.hash = "";

    const scan = {
        tabId,
        seen: new Set([page.href]), // the page itself is never reported as a find
        total: 0,
        done: 0,
        pending: 1, // held until the initial jobs are queued, so we can't "finish" early
        cancelled: false,
        endings: [],
    };
    activeScans.set(tabId, scan);
    reportProgress(scan);

    try {
        scan.endings = await getVariantExtensions();
    } catch (e) {
        sendLog(tabId, `Error loading extension list: ${e}`, "error");
    }

    // images first, so they get the full metadata check before variants can claim their URLs
    for (const base of baseNames)
        for (const ext of IMAGE_EXTS)
            queueImage(scan, new URL(`${base}.${ext}`, page.href).href);

    queueVariants(scan, page.href);
    release(scan);
}