// The canvas area: zoom, pan, pixel inspector (hover / click to pin) and annotation drawing
function createStage(context, { stage, world, main, ann, pxBox, readout, zoomText }) {
    const annotationCtx = ann.getContext("2d");
    const viewState = { x: 0, y: 0, z: 1 };
    let pinnedPixel = null;
    let activeDrag = null;

    function applyView() {
        world.style.transform = `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.z})`;
        main.style.imageRendering = viewState.z >= 3 ? "pixelated" : "auto";
        pxBox.style.boxShadow = `0 0 0 ${Math.max(0.3, 1.5 / viewState.z)}px rgb(174, 0, 255)`;
        zoomText.textContent = `${Math.round(viewState.z * 100)}%`;
    }

    function fit() {
        const { w: imageWidth, h: imageHeight } = context;
        if (!imageWidth) return;

        const stageWidth = stage.clientWidth;
        const stageHeight = stage.clientHeight;
        viewState.z = clamp(Math.min(stageWidth / imageWidth, stageHeight / imageHeight) * 0.95, 0.02, 64);
        viewState.x = (stageWidth - imageWidth * viewState.z) / 2;
        viewState.y = (stageHeight - imageHeight * viewState.z) / 2;
        applyView();
    }

    stage.addEventListener(
        "wheel",
        (event) => {
            event.preventDefault();
            const stageRect = stage.getBoundingClientRect();
            const cursorX = event.clientX - stageRect.left;
            const cursorY = event.clientY - stageRect.top;
            const nextZoom = clamp(viewState.z * (event.deltaY < 0 ? 1.15 : 1 / 1.15), 0.02, 64);

            viewState.x = cursorX - (cursorX - viewState.x) * (nextZoom / viewState.z);
            viewState.y = cursorY - (cursorY - viewState.y) * (nextZoom / viewState.z);
            viewState.z = nextZoom;
            applyView();
        },
        { passive: false }
    );

    // ---- inspector ----
    const getImagePoint = (event) => {
        const canvasRect = main.getBoundingClientRect();

        return [
            ((event.clientX - canvasRect.left) / canvasRect.width) * context.w,
            ((event.clientY - canvasRect.top) / canvasRect.height) * context.h,
        ];
    };

    const samplePixel = (x, y, pixelData) => {
        const byteOffset = (y * context.w + x) * 4;

        return [
            pixelData[byteOffset],
            pixelData[byteOffset + 1],
            pixelData[byteOffset + 2],
            pixelData[byteOffset + 3],
        ];
    };

    function describePixel(x, y) {
        const [red, green, blue, alpha] = samplePixel(x, y, context.out.data);
        const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
        const rawRgba = samplePixel(x, y, context.orig.data);
        const isUnchanged =
            rawRgba[0] === red &&
            rawRgba[1] === green &&
            rawRgba[2] === blue &&
            rawRgba[3] === alpha;

        const alphaHex = alpha < 255 ? formatHexByte(alpha) : "";
        const rawSuffix = isUnchanged ? "" : `  raw rgba(${rawRgba.join(", ")})`;

        return {
            swatch: `rgba(${red},${green},${blue},${alpha / 255})`,
            text: `(${x}, ${y})  rgba(${red}, ${green}, ${blue}, ${alpha})  #${formatHexByte(red)}${formatHexByte(green)}${formatHexByte(blue)}${alphaHex}  hsl(${Math.round(hue)}\u00B0, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%)${rawSuffix}`,
        };
    }

    function renderReadout(hoverInfo) {
        readout.replaceChildren();

        for (const [info, styleClass] of [[hoverInfo, ""], [pinnedPixel, "pinned"]]) {
            if (!info) continue;

            const swatchEl = el("span", "swatch");
            swatchEl.style.background = info.swatch;
            const prefix = styleClass ? "pinned " : "";
            readout.append(swatchEl, el("span", styleClass, `${prefix}${info.text}`));
        }

        if (!hoverInfo && !pinnedPixel)
            readout.textContent = "\u2014";
    }

    function handleHover(event) {
        if (!context.orig) return;

        const [exactX, exactY] = getImagePoint(event);
        const x = Math.floor(exactX);
        const y = Math.floor(exactY);

        if (x < 0 || y < 0 || x >= context.w || y >= context.h) {
            pxBox.style.display = "none";
            renderReadout(null);

            return;
        }

        renderReadout(describePixel(x, y));
        pxBox.style.display = viewState.z >= 6 ? "block" : "none";
        pxBox.style.left = `${x}px`;
        pxBox.style.top = `${y}px`;
    }

    // ---- annotations ----
    function redrawAnn() {
        annotationCtx.clearRect(0, 0, context.w, context.h);
        const strokesToDraw = context.current ? [...context.strokes, context.current] : context.strokes;

        for (const stroke of strokesToDraw) {
            annotationCtx.lineWidth = stroke.width;
            annotationCtx.strokeStyle = stroke.color;
            annotationCtx.lineCap = "round";
            annotationCtx.lineJoin = "round";
            annotationCtx.beginPath();

            const startPt = stroke.pts[0];
            const endPt = stroke.pts[stroke.pts.length - 1];

            if (stroke.tool === "pen") {
                annotationCtx.moveTo(startPt[0], startPt[1]);

                for (const point of stroke.pts) {
                    annotationCtx.lineTo(point[0], point[1]);
                }

                if (stroke.pts.length === 1)
                    annotationCtx.lineTo(startPt[0] + 0.01, startPt[1]);

            } else if (stroke.tool === "line") {
                annotationCtx.moveTo(startPt[0], startPt[1]);
                annotationCtx.lineTo(endPt[0], endPt[1]);
            } else if (stroke.tool === "rect") {
                annotationCtx.rect(startPt[0], startPt[1], endPt[0] - startPt[0], endPt[1] - startPt[1]);
            } else if (stroke.tool === "ellipse") {
                annotationCtx.ellipse(
                    (startPt[0] + endPt[0]) / 2,
                    (startPt[1] + endPt[1]) / 2,
                    Math.abs(endPt[0] - startPt[0]) / 2,
                    Math.abs(endPt[1] - startPt[1]) / 2,
                    0,
                    0,
                    Math.PI * 2
                );
            }

            annotationCtx.stroke();
        }
    }

    const undoStroke = () => {
        context.strokes.pop();
        redrawAnn();
    };

    function setTool(toolName) {
        context.tool = toolName;
        stage.classList.toggle("draw", toolName !== "pan");
        if (context.onTool)
            context.onTool(toolName);
    }

    // ---- pointer: pan, draw, pin ----
    stage.addEventListener("contextmenu", (event) => event.preventDefault());

    stage.addEventListener("pointerdown", (event) => {
        if (!context.orig) return;

        stage.setPointerCapture(event.pointerId);

        if (context.tool === "pan" || event.button !== 0) {
            activeDrag = {
                mode: "pan",
                startX: event.clientX,
                startY: event.clientY,
                viewX: viewState.x,
                viewY: viewState.y,
                moved: false,
            };

            stage.classList.add("grabbing");

        } else {
            context.current = {
                tool: context.tool,
                color: context.draw.color,
                width: context.draw.width,
                pts: [getImagePoint(event)],
            };
            
            activeDrag = { mode: "draw" };
            redrawAnn();
        }
    });

    stage.addEventListener("pointermove", (event) => {
        handleHover(event);
        if (!activeDrag) return;

        if (activeDrag.mode === "pan") {
            const deltaX = event.clientX - activeDrag.startX;
            const deltaY = event.clientY - activeDrag.startY;
            if (Math.abs(deltaX) + Math.abs(deltaY) > 3) activeDrag.moved = true;

            viewState.x = activeDrag.viewX + deltaX;
            viewState.y = activeDrag.viewY + deltaY;
            applyView();
        } else if (context.current) {
            if (context.current.tool === "pen")
                context.current.pts.push(getImagePoint(event));
            else
                context.current.pts[1] = getImagePoint(event);

            redrawAnn();
        }
    });

    const endDrag = (event) => {
        if (!activeDrag) return;

        if (activeDrag.mode === "pan" && !activeDrag.moved && event.button === 0) {
            const [exactX, exactY] = getImagePoint(event);
            const x = Math.floor(exactX);
            const y = Math.floor(exactY);
            const inBounds = x >= 0 && y >= 0 && x < context.w && y < context.h;
            
            pinnedPixel = inBounds ? describePixel(x, y) : null; // click = pin this pixel
            renderReadout(pinnedPixel);
        }

        if (activeDrag.mode === "draw" && context.current) {
            context.strokes.push(context.current);
            context.current = null;
            redrawAnn();
        }

        activeDrag = null;
        stage.classList.remove("grabbing");
    };

    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("pointerleave", () => {
        if (!activeDrag) {
            pxBox.style.display = "none";
            renderReadout(null);
        }
    });

    return {
        fit,
        redrawAnn,
        undoStroke,
        setTool,
        reset() {
            pinnedPixel = null;
            renderReadout(null);
        },
        message(text) {
            readout.textContent = text;
        },
    };
}