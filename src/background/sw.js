// Chrome service worker entry: pulls in the other background files, in order.
// Got to keep this list in sync with "background.scripts" in the firefox manifest.
importScripts(
    "/shared/browser.js",
    "/background/log.js",
    "/background/metadata.js",
    "/background/extensions.js",
    "/background/queue.js",
    "/background/scan.js",
    "/background/register.js",
    "/background/main.js",
);