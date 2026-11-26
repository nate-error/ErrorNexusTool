// Raw byte helpers
// Pack one bit per sample (bit plane `bit` of the chosen channels, left->right, top->bottom) into bytes
function extractBits(data, bit, chans, msbFirst) {
    const channelMap = {
        r: [0],
        g: [1],
        b: [2],
        a: [3],
        rgb: [0, 1, 2],
        rgba: [0, 1, 2, 3],
        bgr: [2, 1, 0],
    };
    
    const channels = channelMap[chans];
    const out = new Uint8Array(((data.length / 4) * channels.length) >> 3);
    let bitIndex = 0;

    for (let offset = 0; offset < data.length; offset += 4) {
        for (const ch of channels) {
            const bitVal = (data[offset + ch] >> bit) & 1;
            const shift = msbFirst ? 7 - (bitIndex & 7) : (bitIndex & 7);
            out[bitIndex >> 3] |= bitVal << shift;
            bitIndex++;
        }
    }

    return out;
}

function detectFormat(bytes) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) { return "png"; }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) { return "jpeg"; }
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) { return "gif"; }
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) { return "webp"; }
    if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) { return "ico"; }
    if (bytes[0] === 0x42 && bytes[1] === 0x4d) { return "bmp"; }

    return "unknown";
}

// Where the image data logically ends (null if unknown). JPEG/GIF use the last EOI/trailer byte: a heuristic
function findEnd(bytes, fmt) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (fmt === "png") {
        let offset = 8;
        while (offset + 12 <= bytes.length) {
            const chunkLen = view.getUint32(offset);
            const chunkType = String.fromCharCode(
                bytes[offset + 4],
                bytes[offset + 5],
                bytes[offset + 6],
                bytes[offset + 7]
            );
            offset += 12 + chunkLen;
            if (chunkType === "IEND") {
                return offset;
            }
        }
        return null;
    }

    if (fmt === "jpeg") {
        for (let i = bytes.length - 2; i >= 2; i--) {
            if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
                return i + 2;
            }
        }
        return null;
    }

    if (fmt === "gif") {
        for (let i = bytes.length - 1; i >= 0; i--) {
            if (bytes[i] === 0x3b) {
                return i + 1;
            }
        }
        return null;
    }

    if (fmt === "webp")
        return Math.min(bytes.length, view.getUint32(4, true) + 8);

    if (fmt === "bmp")
        return Math.min(bytes.length, view.getUint32(2, true));

    return null;
}

function findStrings(bytes, minLen) {
    const matches = [];
    let start = -1;

    for (let i = 0; i <= bytes.length; i++) {
        const isPrintableAscii = i < bytes.length && bytes[i] >= 32 && bytes[i] < 127;

        if (isPrintableAscii) {
            if (start < 0) {
                start = i;
            }

            continue;
        }

        if (start >= 0 && i - start >= minLen) {
            const text = String.fromCharCode(...bytes.subarray(start, Math.min(i, start + 200)));
            matches.push([start, text]);

            if (matches.length >= 500)
                break;
        }

        start = -1;
    }

    return matches;
}