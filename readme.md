# Error Nexus Tools

A browser extension that automates scanning images, testing alternate URLs, and extract EXIF/EOF metadata (kinda), and more when i add other stuff.

---

## Installation

### Firefox (Temporary Load)
1. Open `about:debugging#/runtime-this-firefox`
2. Open the parameters and select **Load Temporary Add-on...**
3. Select `manifest.json` from the project folder

### FIREFOX (Normal Load)
1. Open `about:addons`
2. Open the parameters and select **Install Addon From File**
3. Select the .xpi file `https://addons.mozilla.org/firefox/downloads/file/4987167/3f6378a755d64f35801a-1.4.xpi`

### Chrome / Edge / Brave
1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode** in the top right corner
3. Click **Load unpacked** and select the extension

---

## Configuration

To specify which websites the extension should run on:

1. Open the **Options** page:
   - **Firefox:** Go to `about:addons` -> **Extensions** -> **Error Nexus Tools** -> **Preferences**.
   - **Chrome:** Right-click the extension icon -> **Options**.
2. Enter the domain hostnames (one per line, e.g., `nekoweb.org`, `example.com`).
3. Click **Save Settings**.
