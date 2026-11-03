const browserAPI = typeof browser !== "undefined" ? browser : chrome;
const IS_FIREFOX = typeof browser !== "undefined";

const DEFAULT_ALLOWED_SITES = ["nekoweb.org"];
const DEFAULT_PANEL = { left: null, top: null, width: 350, height: 300, hideNotFound: true };
const MIN_W = 240;
const MIN_H = 80;
const MARGIN = 10;

const storageGet = (area, defaults) =>
    IS_FIREFOX ? browser.storage[area].get(defaults) : new Promise((resolve) => chrome.storage[area].get(defaults, resolve));

const storageSet = (area, items) =>
    IS_FIREFOX ? browser.storage[area].set(items) : new Promise((resolve) => chrome.storage[area].set(items, resolve));

function isDomainAllowed(allowedSites) {
    const host = window.location.hostname.toLowerCase();
    return allowedSites.some((site) => {
        const s = site.trim().toLowerCase();
        return s && (host === s || host.endsWith("." + s));
    });
}

const PANEL_CSS = `
    :host {
        all: initial;
    }
    .panel {
        position: fixed;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        resize: both;
        box-sizing: border-box;
        min-width: ${MIN_W}px;
        min-height: ${MIN_H}px;
        max-width: 100vw;
        max-height: 100vh;
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        font: 12px monospace;
        border: 1px solid #333;
        border-radius: 8px;
        z-index: 2147483647;
    }
    .bar {
        flex: none;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        background: rgba(255, 255, 255, 0.08);
        cursor: move;
        user-select: none;
        touch-action: none;
    }
    .title {
        flex: 1;
        font-weight: bold;
    }
    button {
        font: 11px monospace;
        padding: 3px 7px;
        cursor: pointer;
        color: #fff;
        background: rgba(0, 0, 0, 0.6);
        border: 1px solid #555;
        border-radius: 4px;
    }
    button:hover {
        background: #222;
    }
    .logs {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 4px 10px 8px;
    }
    .log {
        margin-top: 4px;
        padding: 2px 0 0 4px;
        background: #111;
        border-top: 1px solid #555;
        word-break: break-word;
    }
    .log a {
        color: #4af;
    }
    .info,
    .notfound {
        color: #4af;
    }
    .found {
        color: #0f0;
    }
    .meta {
        color: #0af;
    }
    .warn {
        color: #aa0;
    }
    .bad {
        color: #f00;
    }
    .error {
        color: #f66;
    }
    .hide-notfound .log.notfound {
        display: none;
    }
`;

// Floating panel inside a shadow root so page CSS can't interfere
function createPanel(state, onSave) {
    const host = document.createElement("div");
    host.id = "errorNexusHost";
    const root = host.attachShadow({ mode: "closed" });

    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
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

    const logs = el("div", "logs");
    const panel = el("div", "panel");
    panel.append(bar, logs);

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

    return { addLog, reset };
}

(async function init() {
    const { allowedSites } = await storageGet("sync", { allowedSites: DEFAULT_ALLOWED_SITES });
    if (!isDomainAllowed(allowedSites)) return;

    const { panelState } = await storageGet("local", { panelState: {} });
    const ui = createPanel({ ...DEFAULT_PANEL, ...panelState }, (state) =>
        storageSet("local", { panelState: state }),
    );

    browserAPI.runtime.onMessage.addListener((msg) => {
        if (msg.type === "log") ui.addLog(msg);
    });

    // The options page clears panelState to reset the panel
    browserAPI.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.panelState && !changes.panelState.newValue) ui.reset();
    });

    const html = document.documentElement.innerHTML;
    const matches = [...html.matchAll(/([a-zA-Z0-9_\-]+)\.(png|jpg|gif)/gi)];
    const baseNames = [...new Set(matches.map((m) => m[1]))];

    ui.addLog({ text: "Found image bases: " + JSON.stringify(baseNames) });
    browserAPI.runtime.sendMessage({ type: "imageNames", data: baseNames });
})();