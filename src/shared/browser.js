const browserAPI = typeof browser !== "undefined" ? browser : chrome;
const IS_FIREFOX = typeof browser !== "undefined" && typeof browser.runtime.getBrowserInfo === "function";

const DEFAULT_ALLOWED_SITES = [];
const DEFAULT_DELAY_MS = 250;
const MAX_DELAY_MS = 60000;

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