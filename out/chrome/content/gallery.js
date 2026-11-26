// Top-left list of found images: thumbnail, name, badges and a collapsible details section
function createGallery(saved, onSave, onOpen) {
    const panel = el("div", "gallery");
    const title = el("span", "gtitle", "Found images (0)");
    const closeBtn = el("button", "", "\u00D7");
    closeBtn.title = "Hide (shortcut in options)";

    const bar = el("div", "gbar");
    bar.append(title, closeBtn);
    
    const list = el("div", "glist scroll");
    panel.append(bar, list);
    UI.root.append(panel);

    const floating = makeFloating(panel, bar, saved, DEFAULT_GALLERY, onSave);
    const cards = [];
    let userHidden = false;

    const isVisible = () => panel.style.display !== "none" && panel.style.display !== "";
    function show(v) {
        panel.style.display = v ? "flex" : "none";
        if (v) floating.fit();
    }
    function toggle() {
        userHidden = isVisible();
        show(!userHidden);
    }
    closeBtn.addEventListener("click", toggle);

    function addCard(img, index) {
        const card = el("div", "card");
        const head = el("div", "chead");
        const thumb = el("div", "thumb", "\u2026");
        drawThumb(img, thumb, { w: 56, h: 56 });

        const name = el("div", "cname", img.name);
        name.title = img.url;
        const badges = el("div", "badges");
        const badge = (text, cls) => badges.append(el("span", "badge" + (cls ? " " + cls : ""), text));
        badge(img.kind);
        badge(formatByteSize(img.size));
        badge(img.eof ? "EOF ok" : "EOF bad", img.eof ? "ok" : "bad");
    
        const exifCount = Object.keys(img.exif || {}).length;
        badge(exifCount ? `EXIF ${exifCount}` : "no EXIF");
        if (img.xmp)
            badge("XMP");
        
        const meta = el("div", "cmeta");
        meta.append(name, badges);

        const chev = el("button", "chev2", "\u25BE");
        chev.title = "Details";
        head.append(thumb, meta, chev);

        const details = el("div", "cdetails");
        const link = el("a", "", img.url);
        link.href = img.url;
        link.target = "_blank";
        link.rel = "noopener";
        details.append(link);
        
        const lines = [`\nType: ${img.contentType}`, `Size: ${formatByteSize(img.size)} (${img.size} B)`, `EOF: ${img.eof ? "OK" : "MISSING"}`];
        const entries = Object.entries(img.exif || {});
        lines.push(entries.length ? "EXIF:" : "No EXIF data");
        for (const [k, v] of entries)
            lines.push(String(v).includes("\n") ? `  ${k}:\n${v}` : `  ${k}: ${v}`);

        if (img.xmp)
            lines.push("XMP:\n" + img.xmp.slice(0, 1500) + (img.xmp.length > 1500 ? "\u2026" : ""));
        
        details.append(lines.join("\n"));

        chev.addEventListener("click", (e) => {
            e.stopPropagation();
            card.classList.toggle("open");
        });
        head.addEventListener("click", () => onOpen(index));

        card.append(head, details);
        list.appendChild(card);
        cards[index] = card;
    }

    state.on((ev) => {
        if (ev.type === "add") {
            addCard(ev.img, ev.index);
            title.textContent = `Found images (${state.images.length})`;
            if (!userHidden && !isVisible())
                show(true);

        }
        if (ev.type === "select") {
            cards.forEach((c, i) => c.classList.toggle("sel", i === ev.index));
            cards[ev.index]?.scrollIntoView({ block: "nearest" });
        }
    });

    return { toggle, reset: floating.reset, isVisible };
}