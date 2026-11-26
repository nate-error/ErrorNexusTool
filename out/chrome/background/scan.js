const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "avif"];
const METADATA_EXTS = new Set(IMAGE_EXTS);

// Recently fetched image bytes, so the content script can ask for them without a second request
const imageCache = new Map(); // url -> { buffer, type }
function cacheImage(url, buffer, type) {
    imageCache.delete(url);
    imageCache.set(url, { buffer, type });
    while (imageCache.size > 40) imageCache.delete(imageCache.keys().next().value);
}

function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

// content script -> "getImage": only same origin URLs on sites the user granted
async function fetchImageData(tabUrl, url) {
    const origin = new URL(url).origin;
    if (origin !== new URL(tabUrl).origin || !(await permissionsContains([origin + "/*"])))
        return { ok: false, error: "not allowed" };

    let hit = imageCache.get(url);
    if (!hit) {
        const res = await fetch(url);
        if (!res.ok) return { ok: false, error: `status ${res.status}` };
        hit = { buffer: await res.arrayBuffer(), type: res.headers.get("Content-Type") || "application/octet-stream" };
        cacheImage(url, hit.buffer, hit.type);
    }

    return { ok: true, b64: toBase64(hit.buffer), type: hit.type };
}

// shared by images and image variants: report the find, its metadata and EOF
// returns false if the response wasn't actually an image
async function reportImage(scan, kind, url, res) {
    const type = res.headers.get("Content-Type") || "";
    if (!type.startsWith("image/")) {
        // some sites answer 200 with an HTML page for missing files
        sendEntry(scan.tabId, { kind, url, status: res.status, level: "notfound", contentType: type, note: "200 but not an image (soft 404?)" });
        return false;
    }

    const buffer = await res.arrayBuffer();
    const meta = extractMetadata(buffer, url);
    cacheImage(url, buffer, type);

    sendEntry(scan.tabId, {
        kind, url, status: res.status, level: "found", contentType: type, size: buffer.byteLength,
        note: `${meta.eof ? "EOF ok" : "EOF MISSING"} \u00B7 ${Object.keys(meta.exif || {}).length ? "EXIF " + Object.keys(meta.exif).length : "no EXIF"}`,
    });
    sendImage(scan.tabId, {
        url, kind, name: new URL(url).pathname.split("/").pop() || url,
        contentType: type, size: buffer.byteLength,
        exif: meta.exif || {}, xmp: meta.xmp || null, eof: meta.eof,
    });

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
                    sendEntry(scan.tabId, {
                        kind: "Variant", url, status: res.status, level: "found",
                        contentType: res.headers.get("Content-Type") || "",
                        size: Number(res.headers.get("Content-Length")) || null,
                    });
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

// baseNames: absolute URLs without extension (or bare names, resolved against the page)
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

    sendLog(tabId, `Scan started: ${baseNames.length} base names, ${scan.endings.length} variant extensions`, "info");

    // images first, so they get the full metadata check before variants can claim their URLs
    for (const base of baseNames)
        for (const ext of IMAGE_EXTS)
            queueImage(scan, new URL(`${base}.${ext}`, page.href).href);

    queueVariants(scan, page.href);
    release(scan);
}