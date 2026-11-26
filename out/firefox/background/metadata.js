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

const TIFF_TAGS = {
    0x010f: "Make",
    0x0110: "Model",
    0x0132: "DateTime",
    0x9c9b: "XPTitle",
    0x9c9c: "XPComment",
    0x9c9d: "XPAuthor",
    0x9c9e: "XPKeywords",
    0x9c9f: "XPSubject",
};
const XP_TAGS = new Set([0x9c9b, 0x9c9c, 0x9c9d, 0x9c9e, 0x9c9f]);

// XP* tags are always UTF-16LE, regardless of the TIFF byte order
function readUTF16LE(view, start, byteLen) {
    let out = "";
    const end = Math.min(start + byteLen, view.byteLength);
    for (let i = start; i + 1 < end; i += 2) {
        const c = view.getUint16(i, true);
        if (c === 0) break;
        out += String.fromCharCode(c);
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

        const ifd = get32(4);
        const count = get16(ifd);
        const tags = {};

        for (let i = 0; i < count; i++) {
            const base = ifd + 2 + i * 12;
            const tag = get16(base);
            const name = TIFF_TAGS[tag];
            if (!name) continue;
            const len = get32(base + 4); // for XP tags this is a byte count
            const start = len <= 4 ? base + 8 : get32(base + 8); // short values are stored inline
            tags[name] = XP_TAGS.has(tag)
                ? readUTF16LE(view, start, len)
                : readString(view, start);
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