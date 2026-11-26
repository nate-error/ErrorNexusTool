// Unique color count, rare/common lists, click-to-highlight
function tabColors(context, pane) {
    const createSelect = (options) => {
        const selectEl = el("select");

        for (const [optionValue, optionLabel] of options) {
            const optionEl = el("option", "", optionLabel);
            optionEl.value = optionValue;
            selectEl.append(optionEl);
        }

        return selectEl;
    };

    const sourceSelect = createSelect([
        ["proc", "Edited image"],
        ["orig", "Original image"],
    ]);
    const orderSelect = createSelect([
        ["common", "Most common first"],
        ["rare", "Rarest first"],
    ]);
    
    const analyzeButton = el("button", "", "Analyze");
    const clearButton = el("button", "", "Clear highlight");
    const controlsRow = el("div", "row2");
    controlsRow.append(sourceSelect, orderSelect, analyzeButton, clearButton);

    const HINT = "Click Analyze to count unique colors. Click a color to highlight where it appears.";
    const statusInfo = el("div", "hint", HINT);
    const colorList = el("div", "slist scroll");
    pane.append(controlsRow, statusInfo, colorList);

    function analyze() {
        if (!context.orig) return;

        let pixelData = context.orig.data;

        if (sourceSelect.value === "proc") {
            pixelData = new Uint8ClampedArray(pixelData.length);
            processPixels(context.orig.data, pixelData, {
                ...context.params,
                highlightColor: null,
                showOriginal: false,
            });
        }

        const colorCounts = new Map();
        let overflowed = false;

        for (let offset = 0; offset < pixelData.length; offset += 4) {
            const packedRgba =
                ((pixelData[offset] << 24) |
                    (pixelData[offset + 1] << 16) |
                    (pixelData[offset + 2] << 8) |
                    pixelData[offset + 3]) >>>
                0;
            const existingCount = colorCounts.get(packedRgba);

            if (existingCount !== undefined)
                colorCounts.set(packedRgba, existingCount + 1);
            else if (colorCounts.size < 1e6)
                colorCounts.set(packedRgba, 1);
            else
                overflowed = true;
        }

        const totalPixels = pixelData.length / 4;
        const sortedEntries = [...colorCounts.entries()].sort((entryA, entryB) =>
            orderSelect.value === "rare" ? entryA[1] - entryB[1] : entryB[1] - entryA[1]
        );
        const visibleCount = Math.min(sortedEntries.length, 60);
        const overflowPrefix = overflowed ? "more than " : "";
        statusInfo.textContent =
            `${overflowPrefix}${colorCounts.size.toLocaleString()} unique colors in ` +
            `${totalPixels.toLocaleString()} pixels (showing ${visibleCount})`;

        colorList.replaceChildren();

        for (const [packedRgba, count] of sortedEntries.slice(0, 60)) {
            const rgbaColor = [
                packedRgba >>> 24,
                (packedRgba >>> 16) & 255,
                (packedRgba >>> 8) & 255,
                packedRgba & 255,
            ];
            const itemEl = el("div", "sitem");
            const swatchEl = el("span", "swatch");
            swatchEl.style.background = `rgba(${rgbaColor[0]},${rgbaColor[1]},${rgbaColor[2]},${rgbaColor[3] / 255})`;

            const sharePercent = (count / totalPixels) * 100;
            const decimals = count / totalPixels < 0.01 ? 3 : 1;
            const hexCode =
                `#${formatHexByte(rgbaColor[0])}` +
                `${formatHexByte(rgbaColor[1])}` +
                `${formatHexByte(rgbaColor[2])}`;

            itemEl.append(
                swatchEl,
                `${hexCode} a${rgbaColor[3]}  ${count.toLocaleString()} (${sharePercent.toFixed(decimals)}%)`
            );

            itemEl.addEventListener("click", () => {
                context.params.highlightColor = rgbaColor;
                colorList.querySelectorAll(".sitem").forEach((rowEl) => {
                    rowEl.classList.toggle("sel", rowEl === itemEl);
                });
                context.schedule();
            });

            colorList.append(itemEl);
        }
    }

    analyzeButton.addEventListener("click", analyze);

    clearButton.addEventListener("click", () => {
        context.params.highlightColor = null;
        colorList.querySelectorAll(".sitem").forEach((rowEl) => {
            rowEl.classList.remove("sel");
        });
        context.schedule();
    });

    return function onLoad() {
        colorList.replaceChildren();
        statusInfo.textContent = HINT;
    };
}