(async function init() {
    const { galleryState, consoleState } = await storageGet("local", { galleryState: {}, consoleState: {} });
    const { shortcuts: customShortcuts } = await storageGet("sync", { shortcuts: {} });

    const con = createConsole(consoleState, (s) => storageSet("local", { consoleState: s }));
    const playground = createPlayground();
    const gallery = createGallery(
        galleryState,
        (s) => storageSet("local", { galleryState: s }),
        (index) => playground.open(index),
    );

    const navigate = (d) => {
        if (!playground.isOpen() || !state.images.length) return false;
        state.select(state.index + d);
        return true;
    };

    const shortcuts = createShortcuts({
        toggleConsole: () => { con.toggle(); return true; },
        toggleGallery: () => { if (!state.images.length) return false; gallery.toggle(); return true; },
        openPlayground: () => {
            if (!state.images.length || playground.isOpen()) return false;
            playground.open(Math.max(state.index, 0));
            return true;
        },
        closePlayground: () => { if (!playground.isOpen()) return false; playground.close(); return true; },
        prevImage: () => navigate(-1),
        nextImage: () => navigate(1),
        resetView: () => playground.isOpen() && (playground.fit(), true),
        resetEdits: () => playground.isOpen() && (playground.resetEdits(), true),
        toggleOriginal: () => playground.isOpen() && (playground.toggleOriginal(), true),
        undoStroke: () => playground.isOpen() && (playground.undoStroke(), true),
    });
    shortcuts.set(customShortcuts);

    browserAPI.runtime.onMessage.addListener((msg) => {
        if (msg.type === "log") con.addLog(msg);
        if (msg.type === "entry") con.addEntry(msg.entry);
        if (msg.type === "image") state.add(msg.image);
        if (msg.type === "progress") con.setProgress(msg);
        if (msg.type === "throttle") con.setThrottle(msg);
    });

    browserAPI.storage.onChanged.addListener((changes, area) => {
        // the options page removes these keys to reset the panels
        if (area === "local" && changes.galleryState && !changes.galleryState.newValue) gallery.reset();
        if (area === "local" && changes.consoleState && !changes.consoleState.newValue) con.reset();
        if (area === "sync" && changes.shortcuts) shortcuts.set(changes.shortcuts.newValue);
    });

    // --- candidate image names from the page ---
    const bases = new Set();
    const addCandidate = (raw) => {
        let u;
        try { u = new URL(raw, location.href); } catch (e) { return; }
        if (u.origin !== location.origin) return; // only same-origin files can be probed
        bases.add(u.origin + u.pathname.replace(/\.\w+$/, "")); // the exact path the page uses
        const name = u.pathname.split("/").pop().replace(/\.\w+$/, "");
        if (name) bases.add(new URL(name, location.href).href); // same name next to the page
    };

    const re = /[\w\-./%~@+:]+?\.(?:png|jpe?g|gif|webp|ico|bmp|avif)(?![\w])/gi;
    for (const m of document.documentElement.innerHTML.matchAll(re)) addCandidate(m[0]);
    for (const r of performance.getEntriesByType("resource"))
        if (/\.(png|jpe?g|gif|webp|ico|bmp|avif)(\?|#|$)/i.test(r.name)) addCandidate(r.name);

    bases.add(location.origin + "/favicon"); // browsers ask for it even when the page doesn't mention it
    const list = [...bases];
    con.addLog({ text: `Found ${list.length} candidate image base URLs:\n` + list.join("\n"), level: "info" });
    browserAPI.runtime.sendMessage({ type: "imageNames", data: list });
})();