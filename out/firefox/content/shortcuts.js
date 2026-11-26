// Global keyboard shortcuts. actions[name]() returns true when it handled the key (so the page keeps it otherwise).
function createShortcuts(actions) {
    let map = { ...DEFAULT_SHORTCUTS };

    const isTyping = (t) =>
        t && (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT" ||
            (t.tagName === "INPUT" && !["range", "checkbox", "radio", "button", "color"].includes(t.type)));

    window.addEventListener("keydown", (e) => {
        // our own shadow root is closed, so ask it directly which element has focus
        const inner = UI.root.activeElement;
        if (isTyping(inner || document.activeElement)) return;

        const combo = comboFromEvent(e);
        if (!combo) return;

        const name = Object.keys(map).find((k) => map[k] === combo);
        if (!name || !actions[name]) return;

        if (actions[name]()) {
            e.preventDefault();
            e.stopPropagation();
            if (inner)
                inner.blur(); // so Space doesn't also "click" a focused button
        }
    }, true);

    return { set: (custom) => { map = { ...DEFAULT_SHORTCUTS, ...(custom || {}) }; } };
}