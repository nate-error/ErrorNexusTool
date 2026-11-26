// Bit planes + hidden-data (LSB) extraction
function tabBits(ctx, pane) {
    const controls = ctx.controls;

    const plane = controls.addSection(pane, "Bit-plane view");
    controls.addCheck(plane, "Show bit plane", "bitPlaneEnabled");
    controls.addSelect(plane, "Channel", "bitChannel", [["r", "Red"], ["g", "Green"], ["b", "Blue"], ["a", "Alpha"], ["rgb", "R+G+B (per channel)"]]);
    controls.addSlider(plane, "Bit (0 = LSB)", "bitPlane", 0, 7, 1);

    const extract = controls.addSection(pane, "Extract hidden data");
    extract.append(el("div", "hint", "Packs that bit of every pixel (left to right, top to bottom) into bytes."));
    controls.addSelect(extract, "Channels", "extractChannels", [["rgb", "R, G, B"], ["bgr", "B, G, R"], ["r", "R only"], ["g", "G only"], ["b", "B only"], ["rgba", "R, G, B, A"], ["a", "A only"]], () => {});
    controls.addSelect(extract, "Bit order", "extractOrder", [["msb", "MSB first"], ["lsb", "LSB first"]], () => {});

    const row = el("div", "row2");
    const extractButton = el("button", "primary", "Extract");
    const saveButton = el("button", "", "Download .bin");
    row.append(extractButton, saveButton);

    const info = el("div", "hint");
    const text = el("div", "pre scroll");
    text.style.display = "none";
    extract.append(row, info, text);

    let extracted = null;

    extractButton.addEventListener("click", () => {
        if (!ctx.orig) return;

        const p = ctx.params;
        extracted = extractBits(ctx.orig.data, p.bitPlane, p.extractChannels, p.extractOrder === "msb");

        const n = Math.min(extracted.length, 2000);
        let printable = 0;
        let preview = "";

        for (let i = 0; i < n; i++) {
            const ch = extracted[i];
            const ok = (ch >= 32 && ch < 127) || ch === 10;
            if (ok) printable++;
            preview += ok ? String.fromCharCode(ch) : ".";
        }

        info.textContent = `${extracted.length} bytes, ${Math.round((printable / Math.max(n, 1)) * 100)}% printable in the first ${n} (canvas data: pixels with alpha < 255 may be altered)`;
        text.textContent = preview;
        text.style.display = "block";
    });

    saveButton.addEventListener("click", () => {
        if (extracted) ctx.download(new Blob([extracted]), `${ctx.baseName()}-bit${ctx.params.bitPlane}-${ctx.params.extractChannels}.bin`);
    });

    return function onLoad() {
        extracted = null;
        text.style.display = "none";
        info.textContent = "";
    };
}