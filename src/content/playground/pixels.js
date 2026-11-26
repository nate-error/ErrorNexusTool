// Pixel pipeline
const PARAM_DEFAULTS = () => ({
    mode: "normal",
    gamma: 1,
    bright: 0,
    contrast: 0,
    saturation: 100,
    hue: 0,
    thresholdEnabled: false,
    threshold: 128,
    invert: false,
    bitPlaneEnabled: false,
    bitChannel: "r",
    bitPlane: 0,
    extractChannels: "rgb",
    extractOrder: "msb",
    showOriginal: false,
    highlightColor: null,
});

const formatHexByte = (value) => value.toString(16).padStart(2, "0");

function rgbToHsl(red, green, blue) {
    const normRed = red / 255;
    const normGreen = green / 255;
    const normBlue = blue / 255;

    const maxChannel = Math.max(normRed, normGreen, normBlue);
    const minChannel = Math.min(normRed, normGreen, normBlue);
    const chroma = maxChannel - minChannel;
    const lightness = (maxChannel + minChannel) / 2;

    let hue = 0;
    let saturation = 0;

    if (chroma) {
        saturation = lightness > 0.5 ? chroma / (2 - maxChannel - minChannel) : chroma / (maxChannel + minChannel);

        if (maxChannel === normRed) {
            hue = (normGreen - normBlue) / chroma + (normGreen < normBlue ? 6 : 0);
        } else if (maxChannel === normGreen) {
            hue = (normBlue - normRed) / chroma + 2;
        } else {
            hue = (normRed - normGreen) / chroma + 4;
        }

        hue *= 60;
    }

    return [hue, saturation, lightness];
}

function hueSegmentToRgb(channelP, channelQ, hueTerm) {
    let adjustedTerm = hueTerm;

    if (adjustedTerm < 0)
        adjustedTerm += 1;
    if (adjustedTerm > 1)
        adjustedTerm -= 1;

    if (adjustedTerm < 1 / 6)
        return channelP + (channelQ - channelP) * 6 * adjustedTerm;
    if (adjustedTerm < 1 / 2)
        return channelQ;
    if (adjustedTerm < 2 / 3)
        return channelP + (channelQ - channelP) * (2 / 3 - adjustedTerm) * 6;

    return channelP;
}

function buildLut(params) {
    const lookupTable = new Uint8ClampedArray(256);

    const contrastValue = params.contrast * 2.55;
    const contrastFactor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
    const inverseGamma = 1 / params.gamma;
    let isIdentityLut = true;

    for (let index = 0; index < 256; index++) {
        lookupTable[index] = contrastFactor * (Math.pow(index / 255, inverseGamma) * 255 - 128) + 128 + params.bright;
        if (lookupTable[index] !== index)
            isIdentityLut = false;
    }

    return { lookupTable, isIdentityLut };
}

let cachedLut = null;
let cachedLutKey = "";

function getLut(params) {
    const key = `${params.gamma}|${params.bright}|${params.contrast}`;

    if (key !== cachedLutKey) {
        cachedLut = buildLut(params);
        cachedLutKey = key;
    }

    return cachedLut;
}

let processCount = 0;
let processTime = 0;
let lastReport = performance.now();

// source -> destination (RGBA byte arrays): channel / bit-plane view, gamma / light / contrast,
// saturation / hue, threshold, invert, color highlight. No allocations inside the loop
function processPixels(source, destination, params) {
    const start = performance.now();
    
    const { lookupTable, isIdentityLut } = getLut(params);

    const useHslAdjustments = params.saturation !== 100 || params.hue !== 0;
    const saturationScale = params.saturation / 100;
    const hueShiftDegrees = params.hue;
    const bitPlaneEnabled = params.bitPlaneEnabled;
    const bitChannel = params.bitChannel;
    const displayMode = params.mode;
    const bitMask = 1 << params.bitPlane;
    const thresholdEnabled = params.thresholdEnabled;
    const thresholdCutoff = params.threshold;
    const invertColors = params.invert;
    const highlightRgba = params.highlightColor;

    for (let pixelOffset = 0; pixelOffset < source.length; pixelOffset += 4) {
        let red = source[pixelOffset];
        let green = source[pixelOffset + 1];
        let blue = source[pixelOffset + 2];
        let alpha = source[pixelOffset + 3];

        if (bitPlaneEnabled) {
            switch (bitChannel) {
                case "r":
                    red = green = blue = red & bitMask ? 255 : 0;
                    break;
                case "g":
                    red = green = blue = green & bitMask ? 255 : 0;
                    break;
                case "b":
                    red = green = blue = blue & bitMask ? 255 : 0;
                    break;
                case "a":
                    red = green = blue = alpha & bitMask ? 255 : 0;
                    break;
                default:
                    red = red & bitMask ? 255 : 0;
                    green = green & bitMask ? 255 : 0;
                    blue = blue & bitMask ? 255 : 0;
            }

            alpha = 255;

        } else if (displayMode !== "normal") {
            switch (displayMode) {
                case "r":
                    green = blue = 0;
                    break;
                case "g":
                    red = blue = 0;
                    break;
                case "b":
                    red = green = 0;
                    break;
                case "gr":
                    green = blue = red;
                    break;
                case "gg":
                    red = blue = green;
                    break;
                case "gb":
                    red = green = blue;
                    break;
                case "ga":
                    red = green = blue = alpha;
                    alpha = 255;
                    break;
                case "luma":
                    red = green = blue = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
                    break;
            }
        }

        if (!isIdentityLut) {
            red = lookupTable[red];
            green = lookupTable[green];
            blue = lookupTable[blue];
        }

        if (useHslAdjustments) {
            const normRed = red / 255;
            const normGreen = green / 255;
            const normBlue = blue / 255;
            const maxChannel = Math.max(normRed, normGreen, normBlue);
            const minChannel = Math.min(normRed, normGreen, normBlue);
            const chroma = maxChannel - minChannel;
            const lightness = (maxChannel + minChannel) / 2;

            let hue = 0;
            let saturation = 0;

            if (chroma) {
                saturation = lightness > 0.5 ? chroma / (2 - maxChannel - minChannel) : chroma / (maxChannel + minChannel);

                if (maxChannel === normRed) {
                    hue = (normGreen - normBlue) / chroma + (normGreen < normBlue ? 6 : 0);
                } else if (maxChannel === normGreen) {
                    hue = (normBlue - normRed) / chroma + 2;
                } else {
                    hue = (normRed - normGreen) / chroma + 4;
                }

                hue *= 60;
            }

            saturation = Math.min(1, saturation * saturationScale);

            if (!saturation) {
                red = green = blue = Math.round(lightness * 255);
            } else {
                const normalizedHue = ((((hue + hueShiftDegrees) % 360) + 360) % 360) / 360;
                const upperBound = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
                const lowerBound = 2 * lightness - upperBound;

                red = Math.round(hueSegmentToRgb(lowerBound, upperBound, normalizedHue + 1 / 3) * 255);
                green = Math.round(hueSegmentToRgb(lowerBound, upperBound, normalizedHue) * 255);
                blue = Math.round(hueSegmentToRgb(lowerBound, upperBound, normalizedHue - 1 / 3) * 255);
            }
        }

        if (thresholdEnabled) {
            red = green = blue = 0.299 * red + 0.587 * green + 0.114 * blue >= thresholdCutoff ? 255 : 0;
        }

        if (invertColors) {
            red = 255 - red;
            green = 255 - green;
            blue = 255 - blue;
        }

        if (
            highlightRgba &&
            !(
                red === highlightRgba[0] &&
                green === highlightRgba[1] &&
                blue === highlightRgba[2] &&
                alpha === highlightRgba[3]
            )
        ) {
            red *= 0.12;
            green *= 0.12;
            blue *= 0.12;
        }

        destination[pixelOffset] = red;
        destination[pixelOffset + 1] = green;
        destination[pixelOffset + 2] = blue;
        destination[pixelOffset + 3] = alpha;
    }
}