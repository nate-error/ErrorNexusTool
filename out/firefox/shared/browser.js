const browserAPI = typeof browser !== "undefined" ? browser : chrome;
const IS_FIREFOX = typeof browser !== "undefined" && typeof browser.runtime.getBrowserInfo === "function";

const DEFAULT_ALLOWED_SITES = [];
const DEFAULT_DELAY_MS = 250;
const MAX_DELAY_MS = 60000;

// Keyboard shortcuts (stored in sync storage as { action: combo }). Combos look like "space", "g", "ctrl+z", "arrowleft".
const SHORTCUT_ACTIONS = {
    toggleConsole: { label: "Toggle console", def: "space" },
    toggleGallery: { label: "Show / hide image list", def: "g" },
    openPlayground: { label: "Open playground (selected image)", def: "enter" },
    closePlayground: { label: "Close playground", def: "escape" },
    prevImage: { label: "Previous image (playground)", def: "arrowleft" },
    nextImage: { label: "Next image (playground)", def: "arrowright" },
    resetView: { label: "Fit image to screen (playground)", def: "0" },
    resetEdits: { label: "Reset all edits (playground)", def: "r" },
    toggleOriginal: { label: "Toggle original / edited (playground)", def: "o" },
    undoStroke: { label: "Undo last annotation (playground)", def: "ctrl+z" },
};
const DEFAULT_SHORTCUTS = Object.fromEntries(Object.entries(SHORTCUT_ACTIONS).map(([k, v]) => [k, v.def]));

// KeyboardEvent -> "ctrl+alt+shift+meta+key" (null for a lone modifier press)
function comboFromEvent(e) {
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
    const parts = [];
    if (e.ctrlKey) parts.push("ctrl");
    if (e.altKey) parts.push("alt");
    if (e.shiftKey) parts.push("shift");
    if (e.metaKey) parts.push("meta");
    parts.push(e.key === " " ? "space" : e.key.toLowerCase());
    return parts.join("+");
}

const KEY_NAMES = { space: "Space", arrowleft: "←", arrowright: "→", arrowup: "↑", arrowdown: "↓", escape: "Esc", enter: "Enter" };
const prettyCombo = (combo) =>
    combo ? combo.split("+").map((p) => KEY_NAMES[p] || (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1))).join(" + ") : "(none)";

const storageGet = (area, defaults) =>
    IS_FIREFOX ? browser.storage[area].get(defaults) : new Promise((resolve) => chrome.storage[area].get(defaults, resolve));

const storageSet = (area, items) =>
    IS_FIREFOX ? browser.storage[area].set(items) : new Promise((resolve) => chrome.storage[area].set(items, resolve));

const storageRemove = (area, keys) =>
    IS_FIREFOX ? browser.storage[area].remove(keys) : new Promise((resolve) => chrome.storage[area].remove(keys, resolve));

const toLines = (text) => text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

const normalizeExtensions = (list) => [
    ...new Set(list.map((s) => s.trim().replace(/^\./, "").toLowerCase()).filter(Boolean)),
];

// "example.com" -> "*://*.example.com/*" (also matches the bare domain). Accepts pasted URLs too
function toMatchPattern(site) {
    const host = site.trim().toLowerCase().replace(/^[a-z-]+:\/\//, "").replace(/^\*?\.?/, "").split("/")[0];
    return host ? `*://*.${host}/*` : null;
}

const permissionsRequest = (origins) =>
    IS_FIREFOX ? browser.permissions.request({ origins }) : new Promise((r) => chrome.permissions.request({ origins }, r));

const permissionsContains = (origins) =>
    IS_FIREFOX ? browser.permissions.contains({ origins }) : new Promise((r) => chrome.permissions.contains({ origins }, r));

const permissionsRemove = (origins) =>
    IS_FIREFOX ? browser.permissions.remove({ origins }) : new Promise((r) => chrome.permissions.remove({ origins }, r));