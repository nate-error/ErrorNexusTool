const browserAPI = typeof browser !== "undefined" ? browser : chrome;
const IS_FIREFOX = typeof browser !== "undefined";

const storageGet = (area, defaults) => IS_FIREFOX ? browser.storage[area].get(defaults) : new Promise((resolve) => chrome.storage[area].get(defaults, resolve));

const IMAGE_EXTS = ["png", "jpg", "gif", "webp"];

// Logging (background -> content script of the given tab)
// level: info | found | notfound | error | meta | warn | bad
function sendLog(tabId, text, level = "info", href = null) {
    try {
        const p = browserAPI.tabs.sendMessage(tabId, { type: "log", text, level, href });
        if (p && p.catch) p.catch(() => {});
    } catch (e) {
        // tab closed / content script not there
    }
}

function logFailure(tabId, kind, url, status) {
    if (status === 404) {
        sendLog(tabId, `${kind} not found: ${url} (status 404)`, "notfound");
    } else {
        sendLog(tabId, `${kind} unavailable: ${url} (status ${status})`, "warn");
    }
}

// Minimal metadata parsers
const fourCC = (view, off) =>
    String.fromCharCode(
        view.getUint8(off),
        view.getUint8(off + 1),
        view.getUint8(off + 2),
        view.getUint8(off + 3),
    );

function readString(view, start) {
    let out = "";
    for (let i = start; i < view.byteLength; i++) {
        const b = view.getUint8(i);
        if (b === 0) break;
        out += String.fromCharCode(b);
    }
    return out;
}

// `buffer` must start at the TIFF header ("II*\0" or "MM\0*")
function parseTIFF(buffer) {
    try {
        const view = new DataView(buffer);
        const little = view.getUint16(0) === 0x4949;
        const get16 = (o) => view.getUint16(o, little);
        const get32 = (o) => view.getUint32(o, little);
        if (get16(2) !== 0x002a) return null;

        const names = { 0x010f: "Make", 0x0110: "Model", 0x0132: "DateTime" };
        const ifd = get32(4);
        const count = get16(ifd);
        const tags = {};

        for (let i = 0; i < count; i++) {
            const base = ifd + 2 + i * 12;
            const name = names[get16(base)];
            if (!name) continue;
            const len = get32(base + 4);
            const start = len <= 4 ? base + 8 : get32(base + 8); // short values are stored inline
            tags[name] = readString(view, start);
        }
        return tags;
    } catch (e) {
        return null;
    }
}

function parseJPEG(buffer) {
    try {
        const view = new DataView(buffer);
        if (view.getUint16(0) !== 0xffd8) return null;

        let offset = 2;
        while (offset + 4 <= view.byteLength) {
            const marker = view.getUint16(offset);
            const size = view.getUint16(offset + 2);

            // APP1 segment that starts with "Exif"
            if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
                // skip marker(2) + length(2) + "Exif\0\0"(6) to reach the TIFF header
                return parseTIFF(buffer.slice(offset + 10, offset + 2 + size));
            }
            if (marker === 0xffda) break; // start of scan: no more headers
            offset += 2 + size;
        }
    } catch (e) {
        // truncated file
    }
    return null;
}

function parsePNG(buffer) {
    const view = new DataView(buffer);
    const meta = {};
    const skipZ = (i) => {
        while (view.getUint8(i) !== 0) i++;
        return i + 1;
    }; // returns index after the \0

    try {
        let offset = 8; // skip PNG signature
        while (offset + 8 < buffer.byteLength) {
            const length = view.getUint32(offset);
            const type = fourCC(view, offset + 4);
            const dataStart = offset + 8;
            const dataEnd = dataStart + length;

            if (type === "tEXt") {
                const raw = new TextDecoder("latin1").decode(buffer.slice(dataStart, dataEnd));
                const sep = raw.indexOf("\0");
                if (sep !== -1) meta[raw.slice(0, sep)] = raw.slice(sep + 1);
            }

            if (type === "iTXt") {
                const keyEnd = skipZ(dataStart);
                const key = new TextDecoder().decode(buffer.slice(dataStart, keyEnd - 1));
                const compressed = view.getUint8(keyEnd);
                let i = keyEnd + 2; // compression flag + compression method
                i = skipZ(i); // language tag
                i = skipZ(i); // translated keyword
                if (!compressed) meta[key] = new TextDecoder().decode(buffer.slice(i, dataEnd));
            }

            if (type === "IEND") break;
            offset += length + 12;
        }
    } catch (e) {
        // truncated file: keep what we have
    }

    return meta;
}

function parseWebP(buffer) {
    const view = new DataView(buffer);
    const meta = {};

    try {
        if (fourCC(view, 0) !== "RIFF" || fourCC(view, 8) !== "WEBP") return meta;

        let offset = 12;
        while (offset + 8 < buffer.byteLength) {
            const type = fourCC(view, offset);
            const size = view.getUint32(offset + 4, true);
            const dataStart = offset + 8;
            const dataEnd = dataStart + size;

            if (type === "EXIF") {
                // some encoders prefix the TIFF data with "Exif\0\0"
                const skip = fourCC(view, dataStart) === "Exif" ? 6 : 0;
                meta.exif = parseTIFF(buffer.slice(dataStart + skip, dataEnd));
            }
            if (type === "XMP ") {
                meta.xmp = new TextDecoder().decode(buffer.slice(dataStart, dataEnd));
            }
            offset += 8 + size + (size % 2); // chunks are word aligned
        }
    } catch (e) {
        // truncated file
    }

    return meta;
}

function checkPNGEnd(buffer) {
    const view = new DataView(buffer);
    for (let i = buffer.byteLength - 8; i >= 0; i--) {
        if (view.getUint32(i) === 0x49454e44) return true; // "IEND"
    }
    return false;
}

function checkGIFEnd(buffer) {
    return new DataView(buffer).getUint8(buffer.byteLength - 1) === 0x3b;
}

function extractMetadata(buffer, url) {
    const ext = new URL(url).pathname.split(".").pop().toLowerCase();

    switch (ext) {
        case "jpg":
        case "jpeg":
            return { exif: parseJPEG(buffer) || {}, eof: true };
        case "png":
            return { exif: parsePNG(buffer), eof: checkPNGEnd(buffer) };
        case "gif":
            return { exif: {}, eof: checkGIFEnd(buffer) };
        case "webp": {
            const data = parseWebP(buffer);
            return { exif: data.exif || {}, xmp: data.xmp || null, eof: true };
        }
        default:
            return { exif: {}, eof: true };
    }
}

// Variant extensions (user list in storage, bundled file as default)
const normalizeExtensions = (list) => [
    ...new Set(list.map((s) => s.trim().replace(/^\./, "").toLowerCase()).filter(Boolean)),
];

async function getVariantExtensions() {
    const res = await fetch(browserAPI.runtime.getURL("extensions.txt"));
    if (!res.ok) throw new Error(`extensions.txt status ${res.status}`);
    const bundled = normalizeExtensions((await res.text()).split(/\r?\n/));

    const { extAdded, extRemoved } = await storageGet("local", { extAdded: [], extRemoved: [] });
    return normalizeExtensions([...bundled.filter((e) => !extRemoved.includes(e)), ...extAdded]);
}

async function checkAlternateURLs(tabId, originalUrl) {
    try {
        const endings = await getVariantExtensions();
        const base = originalUrl.replace(/\.\w+$/, "");

        await Promise.all(
            endings.map(async (ext) => {
                const testUrl = `${base}.${ext}`;
                if (testUrl === originalUrl) return;

                try {
                    const response = await fetch(testUrl, { method: "HEAD" });
                    if (response.ok)
                        sendLog(tabId, "Variant found: ", "found", testUrl);
                    else
                        logFailure(tabId, "Variant", testUrl, response.status);
                    
                } catch (e) {
                    sendLog(tabId, `Error checking variant ${testUrl}: ${e}`, "error");
                }
            }),
        );
    } catch (e) {
        sendLog(tabId, `Error loading extension list: ${e}`, "error");
    }
}

// Image scan
async function checkImages(tabId, baseNames, pageUrl) {
    for (const base of baseNames) {
        for (const ext of IMAGE_EXTS) {
            const full = new URL(`${base}.${ext}`, pageUrl).href;

            try {
                const res = await fetch(full);
                if (!res.ok) {
                    logFailure(tabId, "Image", full, res.status);
                    continue;
                }

                const meta = extractMetadata(await res.arrayBuffer(), full);
                sendLog(tabId, "Image found: ", "found", full);

                if (Object.keys(meta.exif || {}).length)
                    sendLog(tabId, "EXIF: " + JSON.stringify(meta.exif), "meta");
                else sendLog(tabId, "No EXIF data", "warn");

                sendLog(tabId, "EOF OK: " + meta.eof, meta.eof ? "found" : "bad");
            } catch (e) {
                sendLog(tabId, `Error fetching/parsing ${full}: ${e}`, "error");
            }
        }
    }
}

// Messages from the content script
browserAPI.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === "openOptions") {
        browserAPI.runtime.openOptionsPage();
        return;
    }

    if (msg.type === "imageNames" && sender.tab) {
        const { id: tabId, url } = sender.tab;
        checkAlternateURLs(tabId, url);
        checkImages(tabId, msg.data, url);
    }
});