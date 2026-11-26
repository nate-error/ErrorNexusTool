// Hex dump + strings finder. Exposes ctx.gotoHex(offset).
function tabHex(ctx, pane) {
    const PAGE = 512, W = 8;
    let off = 0;

    const input = el("input");
    input.type = "text";
    input.style.width = "90px";
    
    const prev = el("button", "", "\u25C0");
    const next = el("button", "", "\u25B6");
    const end = el("button", "", "End");
    const trail = el("button", "", "Trailing data");
    const row = el("div", "row2");
    row.append(el("span", "", "Offset"), input, prev, next, end, trail);

    const info = el("div", "hint");
    const pre = el("div", "hexpre scroll");
    pre.style.font = "11px monospace";

    const separator = el("div", "section-divider");

    const minLen = el("input");
    minLen.type = "number"; minLen.min = 2; minLen.value = 6; minLen.style.width = "60px";

    const find = el("button", "", "Find strings");
    const strRow = el("div", "row2");
    strRow.append(el("span", "", "Min length"), minLen, find);

    const strList = el("div", "slist scroll");
    pane.append(strRow, strList, separator, row, info, pre);

    function render() {
        const b = ctx.bytes;
        if (!b) {
            pre.textContent = "";
            return;
        }

        off = clamp(off - (off % W), 0, Math.max(0, b.length - 1));
        const stop = Math.min(off + PAGE, b.length);
        let s = "";
        for (let o = off; o < stop; o += W) {
            let hx = "", as = "";
            for (let i = 0; i < W; i++) {
                const k = o + i;
                if (k < b.length) {
                    hx += formatHexByte(b[k]) + " "; as += b[k] >= 32 && b[k] < 127 ? String.fromCharCode(b[k]) : ".";
                }
                else
                    hx += "   ";
            }

            s += o.toString(16).padStart(6, "0") + "  " + hx + " " + as + "\n";
        }

        pre.textContent = s;
        input.value = "0x" + off.toString(16);
        info.textContent = `bytes ${off}\u2013${stop - 1} of ${b.length}`;
        trail.style.display = ctx.trailStart !== null ? "" : "none";
    }

    const goto = (o) => { off = o; render(); pre.scrollTop = 0; };
    ctx.gotoHex = goto;

    input.addEventListener("change", () => goto(parseInt(input.value, 10) || 0));
    prev.addEventListener("click", () => goto(off - PAGE));
    next.addEventListener("click", () => goto(off + PAGE));
    end.addEventListener("click", () => goto(ctx.bytes ? ctx.bytes.length - PAGE : 0));
    trail.addEventListener("click", () => { if (ctx.trailStart !== null) goto(ctx.trailStart); });
    find.addEventListener("click", () => {
        if (!ctx.bytes) return;

        const found = findStrings(ctx.bytes, Math.max(2, Number(minLen.value) || 6));
        strList.replaceChildren();

        if (!found.length)
            strList.append(el("div", "hint", "No strings found."));
        
        for (const [o, text] of found) {
            const item = el("div", "sitem", `0x${o.toString(16).padStart(6, "0")}  ${text.slice(0, 80)}`);
            item.addEventListener("click", () => goto(o));
            strList.append(item);
        }
    });

    return function onLoad() {
        off = 0;
        strList.replaceChildren();
        render();
    };
}