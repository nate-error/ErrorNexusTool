# Error Nexus Tools

A browser extension that automates scanning images, testing alternate URLs, and extract EXIF/EOF metadata (kinda), and more when I add other stuff.

_If you want to contact me concerning issues or improvements : nathandvd on discord_

---

## Installation

### Firefox (Temporary Installation)

1. Open `about:debugging#/runtime-this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the `manifest.json` file from the `out/firefox/` project folder.

### Firefox (Permanent Installation)

1. Open `about:addons`.
2. Open the menu and select **Install Add-on From File...**.
3. Locate and select `errornexustools-1.7.xpi` from `out/firefox/xpi/`.

   Alternatively, you can drag and drop the `.xpi` file directly into Firefox.

### Chrome / Edge / Brave

1. Open the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the `out/chrome/` folder.

---

## Configuration

### Window Controls

You can resize and move the extension window as needed.

- **Reset Size and Position:** Use the reset button next to the settings cogwheel.
- **Stuck Window:** If the window becomes difficult to access, you can reset its position from the Options menu.

### Configuring Supported Websites

To specify which websites the extension should run on:

1. Open the **Options** page using one of the following methods:
   - **Extension Menu:** Click the small cogwheel in the top-right corner of the extension window.
   - **Firefox:** Navigate to `about:addons` → **Extensions** → **Error Nexus Tools** → **Preferences**.
   - **Chrome:** Right-click the extension icon and select **Options**.
2. Enter the website domains or URLs, one per line.

   Example:
   ```text
   example.com/somefolder/anotherfolder
   nekoweb.org
   puzzledifficultychart.nekoweb.org
   ```

   **Note:** The extension automatically converts each entry into a wildcard match pattern. This means:
   - All subdomains are included, as well as the base domain.
   - URL paths are ignored, even if you enter a specific folder or page.
   - Protocols (`http://` and `https://`) and `www.` prefixes are handled automatically.

   For example, entering `https://www.example.com/somefolder/` generates the following match pattern:

   `*://*.example.com/*`

   This allows the extension to run on `example.com`, `www.example.com`, and any other subdomain, regardless of the URL path. This is by design. 

3. Click **Save Settings**.

### Additional Settings

You can also modify:

- **Request Delay:** Change the delay between requests.
- **File Extensions:** Configure the list of file extensions to test.

File extensions should be entered without the leading dot (`.`).

Example:
```text
jpg
png
webp
gif
```
> [!IMPORTANT]
> Do not forget to click **Save Settings** to apply the changes when changing options. Each 
