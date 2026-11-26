// Playground shell: overlay layout, image list, loading, rendering (fast preview + full render), public API.
// The pieces live next to this file: pixels / bytes (pure logic), controls, stage, and one file per tab
const PREVIEW_MAX_SIDE = 1000; // images with a side longer than this (in px) get a low res preview while sliders move

function createPlayground() {
    // ---- layout ----
    const playgroundEl = el("div", "pg");
    const titleEl = el("span", "pg-title", "Playground");
    const fitButton = el("button", "", "Fit");
    const originalButton = el("button", "", "Original");
    const resetButton = el("button", "", "Reset edits");
    const saveButton = el("button", "", "Save PNG");
    const closeButton = el("button", "", "\u2715 Close");
    const topBar = el("div", "pg-top");
    topBar.append(titleEl, fitButton, originalButton, resetButton, saveButton, closeButton);

    const imageListEl = el("div", "pg-list scroll");
    const stageEl = el("div", "pg-stage");
    const worldEl = el("div", "world");
    const mainCanvas = el("canvas");
    const annotationCanvas = el("canvas");
    const pixelBoxEl = el("div", "pxbox");
    worldEl.append(mainCanvas, annotationCanvas, pixelBoxEl);
    stageEl.append(worldEl);

    const sidePanelEl = el("div", "pg-side");
    const tabsBarEl = el("div", "tabs");
    const panesContainerEl = el("div", "panes scroll");
    sidePanelEl.append(tabsBarEl, panesContainerEl);

    const statusBarEl = el("div", "pg-status");
    const readoutEl = el("div", "readout", "\u2014");
    const zoomTextEl = el("span", "zoomtext");
    statusBarEl.append(readoutEl, zoomTextEl);

    const windowEl = el("div", "pg-win");
    windowEl.append(topBar, imageListEl, stageEl, sidePanelEl, statusBarEl);
    playgroundEl.append(windowEl);
    UI.root.append(playgroundEl);

    const mainContext = mainCanvas.getContext("2d", { willReadFrequently: true });

    // ---- shared context handed to the stage and the tabs ----
    const context = {
        img: null,
        bytes: null,
        w: 0,
        h: 0,
        orig: null,
        out: null,
        fmt: "unknown",
        endOffset: null,
        trailStart: null,
        params: PARAM_DEFAULTS(),
        strokes: [],
        current: null,
        tool: "pan",
        draw: { color: "#ff3366", width: 2 },
        syncers: [],
        schedule: scheduleRender,
        baseName() {
            const rawName = context.img ? context.img.name.replace(/\.\w+$/, "") : "image";

            return rawName || "image";
        },
        download(blob, fileName) {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 5000);
        },
        syncAll() {
            context.syncers.forEach((syncFn) => syncFn());
            originalButton.classList.toggle("on", context.params.showOriginal);
        },
        showTab,
    };

    context.controls = createControls(context);

    const stageController = createStage(context, {
        stage: stageEl,
        world: worldEl,
        main: mainCanvas,
        ann: annotationCanvas,
        pxBox: pixelBoxEl,
        readout: readoutEl,
        zoomText: zoomTextEl,
    });

    Object.assign(context, {
        setTool: stageController.setTool,
        redrawAnn: stageController.redrawAnn,
        undoStroke: stageController.undoStroke,
        fit: stageController.fit,
    });

    // ---- tabs (each file builds its pane; the ones that need it return an onLoad hook) ----
    const tabDefinitions = [
        ["Adjust", tabAdjust],
        ["Bits", tabBits],
        ["Colors", tabColors],
        ["Hex", tabHex],
        ["Info", tabInfo],
        ["Draw", tabDraw],
    ];

    const panesByName = {};
    const buttonsByName = {};

    function showTab(tabName) {
        // Always reset drawing mode when leaving the Draw tab
        if (tabName !== "Draw" && context.tool !== "pan") {
            context.setTool("pan");
        }

        for (const name in panesByName) {
            panesByName[name].classList.toggle("on", name === tabName);
            buttonsByName[name].classList.toggle("on", name === tabName);
        }
    }

    const onLoadHooks = [];

    for (const [tabName, buildTab] of tabDefinitions) {
        buttonsByName[tabName] = el("button", "", tabName);
        panesByName[tabName] = el("div", "pane");
        buttonsByName[tabName].addEventListener("click", () => showTab(tabName));
        tabsBarEl.append(buttonsByName[tabName]);
        panesContainerEl.append(panesByName[tabName]);

        const loadHook = buildTab(context, panesByName[tabName]);
        if (loadHook)
            onLoadHooks.push(loadHook);
    }

    // ---- rendering: full resolution, plus a decimated preview used while a control is being dragged ----
    let previewState = null;
    let frameId = 0;
    let idleTimeoutId = 0;

    // Firefox: arrays that come from DOM objects (getImageData, new ImageData) are Xray-wrapped in content scripts and every element access is very slow.
    // All pixel math therefore runs on plain typed arrays that we create ourselves, and ImageData objects are only built at the moment we hand pixels to the canvas.
    // Handing pixels to the canvas: several ways to build the ImageData, because what a content script is allowed to pass into DOM constructors differs between browsers.
    // The first strategy that works (and is verified by reading one pixel back) is remembered.
    const putStrategies = [
        (c, p, w, h) => c.putImageData(new ImageData(p, w, h), 0, 0),
        (c, p, w, h) => {
            if (typeof cloneInto !== "function") throw new Error("cloneInto unavailable");
            c.putImageData(new ImageData(cloneInto(p, window), w, h), 0, 0);
        },
        (c, p, w, h) => {
            const image = c.createImageData(w, h);
            image.data.set(p);
            c.putImageData(image, 0, 0);
        },
        (c, p, w, h) => {
            const image = c.createImageData(w, h);
            const d = image.data;
            for (let i = 0; i < p.length; i++) d[i] = p[i];
            c.putImageData(image, 0, 0);
        },
    ];
    let putIndex = 0;
    let putVerified = false;

    function putPixels(targetContext, pixels, width, height) {
        for (;;) {
            try {
                putStrategies[putIndex](targetContext, pixels, width, height);

                if (!putVerified && pixels[3] === 255) {
                    const readBack = targetContext.getImageData(0, 0, 1, 1).data;
                    if (readBack[0] !== pixels[0] || readBack[1] !== pixels[1] || readBack[2] !== pixels[2])
                        throw new Error("pixels did not reach the canvas");

                    putVerified = true;
                }

                return;
            } catch (error) {
                if (putIndex >= putStrategies.length - 1) throw error;
                putIndex++;
                putVerified = false;
            }
        }
    }

    function buildPreview() {
        const { w: width, h: height, orig: originalImage } = context;
        const step = Math.ceil(Math.max(width, height) / PREVIEW_MAX_SIDE); // 1 = small enough, no preview

        if (step <= 1) {
            previewState = null;

            return;
        }

        const previewWidth = Math.ceil(width / step);
        const previewHeight = Math.ceil(height / step);
        const sourcePixels = new Uint8ClampedArray(previewWidth * previewHeight * 4);
        const fullPixels = originalImage.data;

        for (let y = 0; y < previewHeight; y++) {
            for (let x = 0; x < previewWidth; x++) {
                const srcIndex = (y * step * width + x * step) * 4;
                const dstIndex = (y * previewWidth + x) * 4;

                sourcePixels[dstIndex] = fullPixels[srcIndex];
                sourcePixels[dstIndex + 1] = fullPixels[srcIndex + 1];
                sourcePixels[dstIndex + 2] = fullPixels[srcIndex + 2];
                sourcePixels[dstIndex + 3] = fullPixels[srcIndex + 3];
            }
        }

        const previewCanvas = document.createElement("canvas");
        previewCanvas.width = previewWidth;
        previewCanvas.height = previewHeight;

        previewState = {
            width: previewWidth,
            height: previewHeight,
            srcPixels: sourcePixels,
            dstPixels: new Uint8ClampedArray(sourcePixels.length),
            canvas: previewCanvas,
            ctx: previewCanvas.getContext("2d"),
        };
    }

    function hasPixelEffects(params) {
        return (
            params.mode !== "normal" ||
            params.gamma !== 1 ||
            params.bright !== 0 ||
            params.contrast !== 0 ||
            params.saturation !== 100 ||
            params.hue !== 0 ||
            params.thresholdEnabled ||
            params.invert ||
            params.bitPlaneEnabled ||
            params.highlightColor !== null
        );
    }

    function renderFull() {
        if (!context.orig) return;

        const { w: width, h: height } = context;

        if (context.params.showOriginal || !hasPixelEffects(context.params)) {
            putPixels(mainContext, context.orig.data, width, height);
        } else {
            processPixels(context.orig.data, context.out.data, context.params);
            putPixels(mainContext, context.out.data, width, height);
        }

        originalButton.classList.toggle("on", context.params.showOriginal);
    }

    function renderPreview() {
        const preview = previewState;

        if (context.params.showOriginal || !hasPixelEffects(context.params)) {
            putPixels(preview.ctx, preview.srcPixels, preview.width, preview.height);
        } else {
            processPixels(preview.srcPixels, preview.dstPixels, context.params);
            putPixels(preview.ctx, preview.dstPixels, preview.width, preview.height);
        }

        mainContext.imageSmoothingEnabled = false;
        mainContext.drawImage(preview.canvas, 0, 0, context.w, context.h);
        originalButton.classList.toggle("on", context.params.showOriginal);
    }

    function safeRenderFull() {
        try {
            renderFull();
        } catch (error) {
            stageController.message(`Render error: ${error.message || error}`);
            console.error("[nexus] render failed", error);
        }
    }

    function scheduleRender() {
        if (!context.orig || frameId) return;

        frameId = requestAnimationFrame(() => {
            frameId = 0;

            try {
                if (!previewState)
                    return renderFull();

                renderPreview();
                clearTimeout(idleTimeoutId);
                idleTimeoutId = setTimeout(safeRenderFull, 150); // full render once the control stops moving
            } catch (error) {
                stageController.message(`Render error: ${error.message || error}`);
                console.error("[nexus] render failed", error);
            }
        });
    }

    // ---- load / switch images ----
    let loadToken = 0;

    function stashEdit() {
        if (context.img && context.orig) {
            context.img._edit = {
                params: { ...context.params },
                strokes: context.strokes,
            };
        }
    }

    async function load(nextImage) {
        if (nextImage === context.img && context.orig) return;

        stashEdit();
        context.img = nextImage;
        const currentToken = ++loadToken;
        titleEl.textContent = `${nextImage.name}  (${state.index + 1}/${state.images.length})`;
        markList();
        stageController.message("Loading\u2026");

        try {
            const [rawBytes, bitmap] = await Promise.all([
                getBytes(nextImage),
                getBitmap(nextImage),
            ]);

            if (currentToken !== loadToken) return;

            context.bytes = rawBytes;
            context.w = bitmap.width;
            context.h = bitmap.height;

            for (const canvasEl of [mainCanvas, annotationCanvas]) {
                canvasEl.width = context.w;
                canvasEl.height = context.h;
            }

            worldEl.style.width = `${context.w}px`;
            worldEl.style.height = `${context.h}px`;
            mainContext.drawImage(bitmap, 0, 0);

            // one copy into plain typed arrays (see putPixels); tabs and the stage only read `.data`
            const canvasPixels = mainContext.getImageData(0, 0, context.w, context.h).data;
            const originalPixels = new Uint8ClampedArray(canvasPixels.length);
            originalPixels.set(canvasPixels);
            context.orig = { data: originalPixels };
            context.out = { data: new Uint8ClampedArray(originalPixels.length) };

            context.params = nextImage._edit ? { ...nextImage._edit.params } : PARAM_DEFAULTS();
            context.strokes = nextImage._edit ? nextImage._edit.strokes : [];
            context.current = null;
            context.fmt = detectFormat(rawBytes);
            context.endOffset = findEnd(rawBytes, context.fmt);
            context.trailStart = context.endOffset !== null && context.endOffset < rawBytes.length ? context.endOffset : null;

            buildPreview();
            context.syncAll();
            renderFull();
            stageController.redrawAnn();

            for (const hook of onLoadHooks) {
                hook();
            }

            stageController.reset();
            stageController.fit();
        } catch (err) {
            if (currentToken !== loadToken) return;

            context.orig = null;
            stageController.message(`Could not load image: ${err.message || err}`);
        }
    }

    // ---- image list on the left ----
    const listItems = [];

    function addItem(image, index) {
        const itemEl = el("div", "pl");
        const thumbEl = el("div", "thumb", "\u2026");

        drawThumb(image, thumbEl, { w: 120, h: 84 });

        itemEl.append(thumbEl, el("div", "nm", image.name));
        itemEl.title = image.url;
        itemEl.addEventListener("click", () => state.select(index));

        imageListEl.append(itemEl);
        listItems[index] = itemEl;
    }

    function markList() {
        listItems.forEach((itemEl, index) => itemEl.classList.toggle("sel", index === state.index));
        listItems[state.index]?.scrollIntoView({ block: "nearest" });
    }

    state.images.forEach(addItem);
    state.on((event) => {
        if (event.type === "add") addItem(event.img, event.index);

        if (event.type === "select") {
            markList();
            if (playgroundEl.classList.contains("open"))
                load(state.images[event.index]);
        }
    });

    // ---- public API ----
    const isOpen = () => playgroundEl.classList.contains("open");

    function open(imageIndex) {
        if (imageIndex != null)
            state.select(imageIndex);

        if (state.index < 0) return;

        playgroundEl.classList.add("open");
        load(state.images[state.index]);
        stageController.fit();
    }

    const close = () => playgroundEl.classList.remove("open");

    function resetEdits() {
        context.params = PARAM_DEFAULTS();
        context.strokes = [];
        context.syncAll();
        renderFull();
        stageController.redrawAnn();
    }

    function toggleOriginal() {
        context.params.showOriginal = !context.params.showOriginal;
        scheduleRender();
    }

    function savePNG() {
        if (!context.orig) return;

        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = context.w;
        exportCanvas.height = context.h;

        const exportContext = exportCanvas.getContext("2d");
        exportContext.drawImage(mainCanvas, 0, 0);
        exportContext.drawImage(annotationCanvas, 0, 0);
        exportCanvas.toBlob(
            (blob) => context.download(blob, `${context.baseName()}-edited.png`),
            "image/png"
        );
    }

    fitButton.addEventListener("click", stageController.fit);
    originalButton.addEventListener("click", toggleOriginal);
    resetButton.addEventListener("click", resetEdits);
    saveButton.addEventListener("click", savePNG);
    closeButton.addEventListener("click", close);
    closeButton.title = "Close (Esc, or click outside the window)";

    playgroundEl.addEventListener("pointerdown", (event) => {
        if (event.target === playgroundEl)
            close();
    }); // click on the dimmed backdrop

    window.addEventListener("resize", () => {
        if (isOpen())
            stageController.fit();
    });

    showTab("Adjust");
    context.syncAll();

    return {
        open,
        close,
        isOpen,
        fit: stageController.fit,
        resetEdits,
        toggleOriginal,
        undoStroke: stageController.undoStroke,
    };
}