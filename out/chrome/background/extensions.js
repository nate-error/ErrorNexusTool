// Variant extensions (user list from the options page, bundled file as default)
async function getVariantExtensions() {
    const { extensions } = await storageGet("local", { extensions: null });

    if (Array.isArray(extensions))
        return normalizeExtensions(extensions);

    const res = await fetch(browserAPI.runtime.getURL("extensions.txt"));

    if (!res.ok)
        throw new Error(`extensions.txt status ${res.status}`);
    
    return normalizeExtensions((await res.text()).split(/\r?\n/));
}