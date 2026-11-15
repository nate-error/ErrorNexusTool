// Floating panel inside a shadow root so page CSS can't interfere
function createPanel(state, onSave) {
    const host = document.createElement("div");
    host.id = "errorNexusHost";
    const root = host.attachShadow({ mode: "closed" });

    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className)
            node.className = className;

        if (text)
            node.textContent = text;

        return node;
    };

    const style = el("style");
    style.textContent = PANEL_CSS;

    const toggle = el("button", "toggle");
    const resetBtn = el("button", "reset", "\u21BB");
    resetBtn.title = "Reset position and size";
    const gear = el("button", "gear", "\u2699");
    gear.title = "Settings";

    const bar = el("div", "bar");
    bar.append(el("span", "title", "Error Nexus Tools"), toggle, resetBtn, gear);

    const spinner = el("div", "spinner off");
    const statusText = el("span", "statustext", "Idle");
    const statusRow = el("div", "statusrow");
    statusRow.append(spinner, statusText);

    const logs = el("div", "logs");
    const panel = el("div", "panel");
    panel.append(bar, statusRow, logs);

    root.append(style, panel);
    document.documentElement.appendChild(host);

    let hideNotFound = !!state.hideNotFound;
    let hiddenCount = 0;
    let dirty = false;
    let saveTimer = null;

    const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

    // Apply a size and position, always keeping the panel fully inside the viewport
    function place(left, top, width, height) {
        width = clamp(width, MIN_W, window.innerWidth);
        height = clamp(height, MIN_H, window.innerHeight);
        Object.assign(panel.style, {
            width: width + "px",
            height: height + "px",
            left: clamp(left, 0, window.innerWidth - width) + "px",
            top: clamp(top, 0, window.innerHeight - height) + "px",
        });
    }

    // Re-clamp the current geometry (after a resize or a window change)
    function fit() {
        const r = panel.getBoundingClientRect();
        place(r.left, r.top, r.width, r.height);
    }

    function placeDefault() {
        place(
            window.innerWidth - DEFAULT_PANEL.width - MARGIN,
            window.innerHeight - DEFAULT_PANEL.height - MARGIN,
            DEFAULT_PANEL.width,
            DEFAULT_PANEL.height,
        );
    }

    function save() {
        clearTimeout(saveTimer);
        if (!dirty) return;
        dirty = false;
        fit();
        const r = panel.getBoundingClientRect();
        onSave({
            left: Math.round(r.left),
            top: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height),
            hideNotFound,
        });
    }

    // Fallback save in case the mouse release is missed
    function markDirty() {
        dirty = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 500);
    }

    function reset() {
        placeDefault();
        dirty = true;
        save();
    }

    if (state.left === null || state.top === null) {
        place(
            window.innerWidth - state.width - MARGIN,
            window.innerHeight - state.height - MARGIN,
            state.width,
            state.height,
        );
    } else {
        place(state.left, state.top, state.width, state.height);
    }
    panel.classList.toggle("hide-notfound", hideNotFound);

    const renderToggle = () => {
        toggle.textContent = `${hideNotFound ? "Show" : "Hide"} Not Found (${hiddenCount})`;
    };
    renderToggle();

    toggle.addEventListener("click", () => {
        hideNotFound = !hideNotFound;
        panel.classList.toggle("hide-notfound", hideNotFound);
        renderToggle();
        logs.scrollTop = logs.scrollHeight;
        dirty = true;
        save();
    });

    resetBtn.addEventListener("click", reset);
    gear.addEventListener("click", () => browserAPI.runtime.sendMessage({ type: "openOptions" }));

    // Drag by the header bar
    bar.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest("button")) return;

        const r = panel.getBoundingClientRect();
        const dx = e.clientX - r.left;
        const dy = e.clientY - r.top;
        bar.setPointerCapture(e.pointerId);

        const move = (ev) => place(ev.clientX - dx, ev.clientY - dy, r.width, r.height);
        const up = () => {
            bar.removeEventListener("pointermove", move);
            bar.removeEventListener("pointerup", up);
            bar.removeEventListener("pointercancel", up);
            dirty = true;
            save();
        };

        bar.addEventListener("pointermove", move);
        bar.addEventListener("pointerup", up);
        bar.addEventListener("pointercancel", up);
    });

    // Native CSS resize handle: mark dirty while resizing, save on release
    let lastW = panel.offsetWidth;
    let lastH = panel.offsetHeight;
    new ResizeObserver(() => {
        if (panel.offsetWidth !== lastW || panel.offsetHeight !== lastH) {
            lastW = panel.offsetWidth;
            lastH = panel.offsetHeight;
            markDirty();
        }
    }).observe(panel);

    for (const evt of ["mouseup", "pointerup", "touchend"]) {
        window.addEventListener(evt, save, true);
    }
    window.addEventListener("resize", fit);

    function addLog({ text, level = "info", href = null }) {
        const el = document.createElement("div");
        el.className = `log ${level}`;
        el.append(text);

        if (href) {
            const a = document.createElement("a");
            a.href = href;
            a.textContent = href;
            a.target = "_blank";
            a.rel = "noopener";
            el.append(a);
        }

        if (level === "notfound") {
            hiddenCount++;
            renderToggle();
        }

        logs.appendChild(el);
        logs.scrollTop = logs.scrollHeight;
    }

    function setProgress({ active, done, total }) {
        spinner.classList.toggle("off", !active);
        statusText.textContent = active ? total ? `Searching\u2026 ${done}/${total}` : "Searching\u2026" : `Done (${done} URLs checked)`;
    }

    return { addLog, reset, setProgress };
}
