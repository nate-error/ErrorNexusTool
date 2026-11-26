function tabInfo(ctx, pane) {
    return function onLoad() {
        pane.replaceChildren();
        const { img, bytes, w, h } = ctx;
        if (!img || !bytes) return;

        const kv = (k, v) => {
            const d = el("div", "kv");
            d.append(el("b", "", k + ": "), v);
            pane.append(d);
        };
        const link = el("a", "", img.url);
        link.href = img.url; link.target = "_blank"; link.rel = "noopener";

        kv("URL", link);
        kv("Content-Type", img.contentType);
        kv("Detected format", ctx.fmt);
        kv("Dimensions", `${w} \u00D7 ${h}`);
        kv("Size", `${formatByteSize(bytes.length)} (${bytes.length} B)`);
        kv("EOF marker", img.eof ? "OK" : "MISSING");
        kv("Data ends at", ctx.endOffset === null ? "unknown" : `0x${ctx.endOffset.toString(16)} (${ctx.endOffset} B)`);
        kv("Trailing data", ctx.trailStart !== null ? `${bytes.length - ctx.trailStart} B after the end of the image` : "none");

        if (ctx.trailStart !== null) {
            const go = el("button", "", "Show trailing data in Hex");
            go.addEventListener("click", () => {
                ctx.showTab("Hex");
                ctx.gotoHex(ctx.trailStart);
            });

            const row = el("div", "row2");
            row.append(go);
            pane.append(row);
        }

        const entries = Object.entries(img.exif || {});
        pane.append(el("div", "kv", entries.length ? "EXIF" : "No EXIF data"));
        if (entries.length)
            pane.append(el("div", "pre", entries.map(([k, v]) => `${k}: ${v}`).join("\n")));

        if (img.xmp) {
            pane.append(el("div", "kv", "XMP"));
            pane.append(el("div", "pre", img.xmp.slice(0, 4000)));
        }
    };
}