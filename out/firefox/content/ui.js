// Shared UI plumbing: shadow root, helpers, image store, byte loaders, draggable panels
const el = (tagName, className, textContent) => {
    const node = document.createElement(tagName);
    if (className)
        node.className = className;
    
    if (textContent)
        node.textContent = textContent;

    return node;
};

const clamp = (value, minValue, maxValue) => Math.min(Math.max(value, minValue), Math.max(minValue, maxValue));

const formatByteSize = (byteCount) => {
    if (byteCount < 1024)
        return `${byteCount} B`;
    
    if (byteCount < 1048576)
        return `${(byteCount / 1024).toFixed(1)} KB`;

    return `${(byteCount / 1048576).toFixed(2)} MB`;
};

// One closed shadow root holds the console, the image list and the playground
const UI = (() => {
    const hostEl = document.createElement("div");
    hostEl.id = "errorNexusHost";
    
    const shadowRoot = hostEl.attachShadow({ mode: "closed" });
    const styleEl = el("style");
    styleEl.textContent = UI_CSS;
    shadowRoot.append(styleEl);
    document.documentElement.appendChild(hostEl);

    return { root: shadowRoot };
})();

const askBackground = (message) => Promise.resolve(browserAPI.runtime.sendMessage(message));

// Found images (filled by messages from the background)
const state = {
    images: [],
    index: -1,
    subs: new Set(),
    on(listener) {
        this.subs.add(listener);
    },
    emit(event) {
        for (const listener of this.subs) {
            listener(event);
        }
    },
    add(imageEntry) {
        if (this.images.some((existing) => existing.url === imageEntry.url)) return;

        this.images.push(imageEntry);
        this.emit({ type: "add", img: imageEntry, index: this.images.length - 1 });
        if (this.index < 0) this.select(0);
    },
    select(targetIndex) {
        const imageCount = this.images.length;
        if (!imageCount) return;

        this.index = ((targetIndex % imageCount) + imageCount) % imageCount; // wraps around
        this.emit({ type: "select", index: this.index });
    },
};

// Raw bytes / decoded bitmap of an image, fetched once through the background script
function getBytes(imageEntry) {
    if (!imageEntry._bytes) {
        imageEntry._bytes = askBackground({ type: "getImage", url: imageEntry.url })
            .then((response) => {
                if (!response || !response.ok) throw new Error((response && response.error) || "no response");

                const binaryString = atob(response.b64);
                const bytes = new Uint8Array(binaryString.length);

                for (let index = 0; index < binaryString.length; index++) {
                    bytes[index] = binaryString.charCodeAt(index);
                }

                return bytes;
            })
            .catch((error) => {
                imageEntry._bytes = null;

                throw error;
            });
    }

    return imageEntry._bytes;
}

function getBitmap(imageEntry) {
    if (!imageEntry._bmp) {
        imageEntry._bmp = getBytes(imageEntry)
            .then((bytes) =>
                createImageBitmap(new Blob([bytes], { type: imageEntry.contentType }), {
                    premultiplyAlpha: "none",
                    colorSpaceConversion: "none",
                })
            )
            .catch((error) => {
                imageEntry._bmp = null;

                throw error;
            });
    }

    return imageEntry._bmp;
}

function drawThumb(imageEntry, targetBox, targetSize) {
    getBitmap(imageEntry)
        .then((bitmap) => {
            const scale = Math.min(targetSize.w / bitmap.width, targetSize.h / bitmap.height);
            const thumbCanvas = el("canvas");
            thumbCanvas.width = Math.max(1, Math.round(bitmap.width * scale));
            thumbCanvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const thumbCtx = thumbCanvas.getContext("2d");
            thumbCtx.imageSmoothingEnabled = scale < 1;
            thumbCtx.drawImage(bitmap, 0, 0, thumbCanvas.width, thumbCanvas.height);
            targetBox.replaceChildren(thumbCanvas);
        })
        .catch(() => {
            targetBox.textContent = "?";
        });
}

// Makes a fixed panel draggable by `handleBar`, keeps it inside the viewport, persists geometry via onSave
function makeFloating(panel, handleBar, savedBounds, defaultBounds, onSave) {
    let isDirty = false;
    let saveTimer = null;

    function place(left, top, width, height) {
        const clampedWidth = clamp(width, MIN_W, window.innerWidth);
        const clampedHeight = clamp(height, MIN_H, window.innerHeight);

        Object.assign(panel.style, {
            width: `${clampedWidth}px`,
            height: `${clampedHeight}px`,
            left: `${clamp(left, 0, window.innerWidth - clampedWidth)}px`,
            top: `${clamp(top, 0, window.innerHeight - clampedHeight)}px`,
        });
    }

    function fit() {
        if (!panel.offsetWidth) return; // hidden

        const rect = panel.getBoundingClientRect();
        place(rect.left, rect.top, rect.width, rect.height);
    }

    function save() {
        clearTimeout(saveTimer);
        if (!isDirty || !panel.offsetWidth) {
            isDirty = false;

            return;
        }

        isDirty = false;
        fit();
        const rect = panel.getBoundingClientRect();

        onSave({
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
        });
    }

    function markDirty() {
        isDirty = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 500);
    }

    function reset() {
        place(defaultBounds.left, defaultBounds.top, defaultBounds.width, defaultBounds.height);
        isDirty = true;
        save();
    }

    place(
        savedBounds.left ?? defaultBounds.left,
        savedBounds.top ?? defaultBounds.top,
        savedBounds.width ?? defaultBounds.width,
        savedBounds.height ?? defaultBounds.height
    );

    handleBar.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button")) return;

        const rect = panel.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        handleBar.setPointerCapture(event.pointerId);

        const handlePointerMove = (moveEvent) => {
            place(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY, rect.width, rect.height);
        };

        const handlePointerUp = () => {
            handleBar.removeEventListener("pointermove", handlePointerMove);
            handleBar.removeEventListener("pointerup", handlePointerUp);
            handleBar.removeEventListener("pointercancel", handlePointerUp);
            isDirty = true;
            save();
        };

        handleBar.addEventListener("pointermove", handlePointerMove);
        handleBar.addEventListener("pointerup", handlePointerUp);
        handleBar.addEventListener("pointercancel", handlePointerUp);
    });

    let lastWidth = 0;
    let lastHeight = 0;

    new ResizeObserver(() => {
        if (!panel.offsetWidth) return;

        if (panel.offsetWidth !== lastWidth || panel.offsetHeight !== lastHeight) {
            lastWidth = panel.offsetWidth;
            lastHeight = panel.offsetHeight;
            markDirty();
        }
    }).observe(panel);

    for (const eventName of ["mouseup", "pointerup", "touchend"]) {
        window.addEventListener(eventName, save, true);
    }

    window.addEventListener("resize", fit);

    return { fit, reset };
}