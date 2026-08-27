const browserAPI = typeof browser !== "undefined" ? browser : chrome;

CURRENT_TAB_ID = null;


// Helper to send logs to content script
function sendToContent(msg, level="info", color="#4af", bg="#111") {
    if (!CURRENT_TAB_ID) return;

    browserAPI.tabs.sendMessage(CURRENT_TAB_ID, {
        type: "log",
        level,
        msg,
        color,
        bg
    });
}


// Minimal EXIF / EOF Parser
function dv(buf) { return new DataView(buf); }

function parseJPEGEXIF(buffer) {
    try {
        let view = dv(buffer);
        if (view.getUint16(0) !== 0xFFD8) {
            sendToContent("Not a JPEG file", "error");
            return null;
        }
        let offset = 2;
        while (offset < view.byteLength) {
            let marker = view.getUint16(offset);
            if (marker === 0xFFE1) {
                let exifLength = view.getUint16(offset + 2);
                let exifData = buffer.slice(offset + 4, offset + 2 + exifLength);
                return parseTIFF(exifData);
            }
            let size = view.getUint16(offset + 2);
            offset += 2 + size;
        }
    } catch(e) {
        sendToContent( "Error parsing JPEG EXIF: " + e, "error");
    }
    return null;
}

function parseTIFF(buffer) {
    try {
        let view = dv(buffer);
        let little = view.getUint16(0) === 0x4949;
        let get16 = (off) => view.getUint16(off, little);
        let get32 = (off) => view.getUint32(off, little);

        if (get16(2) !== 0x002A) return null;
        let offset = get32(4);
        let numTags = get16(offset);
        let tags = {};
        for (let i = 0; i < numTags; i++) {
            let base = offset + 2 + i*12;
            let tag = get16(base);
            let valOffset = get32(base + 8);
            if(tag === 0x0110) tags.Model = readString(view, valOffset, buffer);
            if(tag === 0x010F) tags.Make = readString(view, valOffset, buffer);
            if(tag === 0x0132) tags.DateTime = readString(view, valOffset, buffer);
        }
        return tags;
    } catch(e) {
        sendToContent("Error parsing TIFF: " + e, "error");
        return null;
    }
}

function parsePNGChunks(buffer) {
    const view = new DataView(buffer);
    let offset = 8; // skip PNG signature
    let meta = {};

    try {
        while (offset + 8 < buffer.byteLength) {
            const length = view.getUint32(offset);
            const type = String.fromCharCode(
                view.getUint8(offset + 4),
                view.getUint8(offset + 5),
                view.getUint8(offset + 6),
                view.getUint8(offset + 7)
            );

            const dataStart = offset + 8;
            const dataEnd = dataStart + length;

            if (type === "tEXt") {
                const raw = new TextDecoder("latin1").decode(
                    buffer.slice(dataStart, dataEnd)
                );
                const sep = raw.indexOf("\0");
                if (sep !== -1) {
                    meta[raw.slice(0, sep)] = raw.slice(sep + 1);
                }
            }

            if (type === "iTXt") {
                let i = dataStart;
                while (view.getUint8(i) !== 0) i++;
                const key = new TextDecoder().decode(buffer.slice(dataStart, i));
                i++; // null

                const compressed = view.getUint8(i); i++;
                i++; // compression method

                while (view.getUint8(i) !== 0) i++; i++; // language
                while (view.getUint8(i) !== 0) i++; i++; // translated keyword

                if (!compressed) {
                    const text = new TextDecoder().decode(buffer.slice(i, dataEnd));
                    meta[key] = text;
                }
            }

            if (type === "IEND") break;

            offset += length + 12;
        }
    } catch (e) {
        sendToContent("PNG chunk parse error: " + e, "error");
    }

    return meta;
}


function parseWebP(buffer) {
    const view = new DataView(buffer);
    let meta = {};

    try {
        if (
            view.getUint32(0, false) !== 0x52494646 || // RIFF
            view.getUint32(8, false) !== 0x57454250  // WEBP
        ) return {};

        let offset = 12;

        while (offset + 8 < buffer.byteLength) {
            const type = String.fromCharCode(
                view.getUint8(offset),
                view.getUint8(offset + 1),
                view.getUint8(offset + 2),
                view.getUint8(offset + 3)
            );
            const size = view.getUint32(offset + 4, true);
            const dataStart = offset + 8;
            const dataEnd = dataStart + size;

            if (type === "EXIF") {
                meta.exif = parseTIFF(buffer.slice(dataStart, dataEnd));
            }

            if (type === "XMP ") {
                meta.xmp = new TextDecoder().decode(
                    buffer.slice(dataStart, dataEnd)
                );
            }

            offset += 8 + size + (size % 2); // word alignment
        }
    } catch (e) {
        sendToContent("WebP parse error: " + e, "error");
    }

    return meta;
}


function readString(view,start,buffer){
    let chars=[];
    for(let i=start;i<buffer.byteLength;i++){
        let b=view.getUint8(i);
        if(b===0) break;
        chars.push(String.fromCharCode(b));
    }
    return chars.join('');
}

function checkPNGEOF(buffer){
    try {
        let view=dv(buffer);
        for(let i=buffer.byteLength-8;i>=0;i--){
            if(view.getUint32(i, false)===0x49454E44) return true;
        }
    } catch(e) {
        sendToContent("Error checking PNG EOF: " + e, "error");
    }
    return false;
}

function checkGIFEOF(buffer){
    try {
        let view=dv(buffer);
        return view.getUint8(buffer.byteLength-1)===0x3B;
    } catch(e) {
        sendToContent("Error checking GIF EOF: " + e, "error");
        return false;
    }
}

async function extractMetadata(buffer,url){
    let ext=url.toLowerCase().split('.').pop();
    let meta={};
    if(ext==="jpg"||ext==="jpeg"){meta.exif=parseJPEGEXIF(buffer)||{}; meta.eof=true;}
    if(ext === "png") {meta.exif = parsePNGChunks(buffer); meta.eof = checkPNGEOF(buffer);}
    if(ext==="gif"){meta.exif={}; meta.eof=checkGIFEOF(buffer);}
    if(ext === "webp") {let data = parseWebP(buffer); meta.exif = data.exif || {}; meta.xmp = data.xmp || null; meta.eof = true;}
    return meta;
}


// Check alternate URL endings
async function checkAlternateURLs(originalUrl){
    try {
        const fileUrl = browserAPI.runtime.getURL("extensions.txt");
        const responseFile = await fetch(fileUrl);
        if (!responseFile.ok) {
            sendToContent(`Failed to load extension.txt (Status ${responseFile.status})`, "error"); 
            return;
        }
        
        const rawText = await responseFile.text();
        const endings = rawText.split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(ext => "." + ext);

        let base = originalUrl.replace(/\.\w+$/, "");
        
        const checks = endings.map(async (ext) => {
            let testUrl = base + ext;
            if (testUrl === originalUrl) return;

            try {
                let response = await fetch(testUrl, { method: "HEAD" });
                if(response.ok){
                    sendToContent(`Variant found: <a href="${testUrl}" target="_blank" style="color:#4af;">${testUrl}</a>`, "found");
                } else {
                    sendToContent(`Variant not found: ${testUrl} (status ${response.status})`, "notfound");
                }
            } catch(e) {
                sendToContent(`Error checking variant ${testUrl}: ${e}`, "error");
            }
        });

        // Run all at once (hopefully there won't be problems with 429)
        await Promise.all(checks);

    } catch(e) {
        sendToContent(`Error processing extension.txt: ${e}`, "error");
    }
}


// Fetch images and extract metadata
async function checkImages(baseNames,pageUrl){
    const exts = ["png","jpg","gif","webp"];
    for(let base of baseNames){
        for(let ext of exts){
            // Resolve relative URLs
            let full = new URL(base + "." + ext, pageUrl).href;
            try {
                let res = await fetch(full);
                if (!res.ok) {
                    sendToContent(`Image not found: ${full} (status ${res.status})`, "notfound");
                    continue;
                }
                let buffer = await res.arrayBuffer();
                let meta = await extractMetadata(buffer, full);
                sendToContent(`Image found: <a href="${full}" target="_blank">${full}</a>`, "found", "#0f0", "#111");

                // EXIF info
                if(Object.keys(meta.exif||{}).length){
                    sendToContent("EXIF: " + JSON.stringify(meta.exif), "found", "#0af", "#111");
                } else {
                    sendToContent("No EXIF data", "noresult", "#aa0", "#111");
                }

                // EOF check
                sendToContent("EOF OK: " + meta.eof, "found", meta.eof ? "#0f0" : "#f00", "#111");
            } catch(e) {
                sendToContent(`Error fetching/parsing ${full}: ${e}`, "error");
            }
        }
    }
}


// Listen for messages from content script
browserAPI.runtime.onMessage.addListener(async (msg, sender) => {
    if (sender.tab?.id) {
        CURRENT_TAB_ID = sender.tab.id;
    }

    if (msg.type === "imageNames") {
        CURRENT_TAB_ID = sender.tab.id;
        let tabUrl = sender.tab.url;

        checkAlternateURLs(tabUrl);
        checkImages(msg.data, tabUrl);
    }
});