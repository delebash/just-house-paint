// SPDX-License-Identifier: MIT
// The pixel work around the AI render: the model's working size, the paste-back (the render
// only inside a slightly feathered surface mask, the original photo everywhere else) and the
// color lock (inside the mask: the paint × the render's own normalized lighting), plus the
// ΔE2000 check of the result. The math is the probe's colorlock.js (just-house-paint
// RESEARCH §9 "FLUX.2 klein 4B edits", §10 "Probe round 2 — masked AI"); this module only
// works on raw 8-bit RGB buffers so the tests can run it on tiny synthetic images.
//
// Image decode / resize / blur go through sharp (libvips); color math through culori.

import { differenceCiede2000, parse } from "culori";
import sharp from "sharp";

/** Defaults — DATA the app seeds into its database (editable there). */
export const DEFAULT_COMPOSE = Object.freeze({
  // Gaussian sigma, in pixels at the photo's full size, of the paste-back edge.
  featherPx: 2,
  // Mask coverage (0..1) that counts as "on the surface" for the lighting statistics.
  insideAt: 0.5,
  // The surface's normally lit level: this percentile of its luminance in the render.
  basePercentile: 75,
  // "Normally lit" pixels — luminance ÷ base inside this band; ΔE is measured on them.
  litBand: Object.freeze([0.9, 1.1]),
  // Lock only what the AI repainted: a pixel the AI left as it was (white trim inside a body mask)
  // keeps the AI's own pixel instead of turning paint-colored (RESEARCH §10: the pink trim). The
  // change is the RGB distance between the render and the photo relative to their brightness
  // (distance ÷ (mean channel value + 20)), so a darkened door counts as repainted while white the
  // AI kept, give or take noise, doesn't; the weight ramps from 0 to 1 across this range.
  lockOnlyRepainted: true,
  repaintedRange: Object.freeze([0.08, 0.16]),
  // …unless the paint is close to the surface's old color anyway (ΔE2000 below this): then the AI
  // had little to change, and the whole surface is locked.
  sameColorDeltaE: 10,
  // The light a part's paint now says falls on it (lightGain), per channel, is capped to this range:
  // a wrong pick can't turn the picture to nonsense (the painter's own cap — src/services/tint.js).
  gainLimits: Object.freeze([0.25, 4]),
});

/** The model's working size — the defaults are the measured recipe's 1024×768 for a 4:3 photo. */
export const DEFAULT_WORKING_SIZE = Object.freeze({
  targetPixels: 1024 * 768,
  multipleOf: 16, // FLUX.2's VAE (8×) plus its 2×2 patches
});

/** sRGB 0..1 → linear light (the exact sRGB transfer curve). */
export const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** Linear light → sRGB 0..1. */
export const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
/** Relative luminance of linear RGB (Rec. 709 / sRGB primaries). */
export const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const LINEAR_OF_BYTE = Float32Array.from({ length: 256 }, (_, i) => toLinear(i / 255));
const de2000 = differenceCiede2000();

/**
 * The working size for a `width`×`height` photo: about `targetPixels`, each side a multiple
 * of `multipleOf`, the aspect kept to within the rounding, never larger than the photo.
 */
export function workingSize(width, height, { targetPixels, multipleOf } = DEFAULT_WORKING_SIZE) {
  const scale = Math.min(1, Math.sqrt(targetPixels / (width * height)));
  const snap = (v) => Math.max(multipleOf, Math.round((v * scale) / multipleOf) * multipleOf);
  return { width: snap(width), height: snap(height) };
}

/** Paint hex → its sRGB culori color (throws on a malformed hex). */
export function paintColor(hex) {
  const c = typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex) ? parse(hex) : null;
  if (!c) throw new TypeError(`not a #rrggbb paint color: ${hex}`);
  return c;
}

/** Linear luminance of every pixel of an 8-bit RGB buffer. */
export function luminanceOf(rgb) {
  const n = rgb.length / 3;
  const Y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    Y[i] = luminance(LINEAR_OF_BYTE[rgb[i * 3]], LINEAR_OF_BYTE[rgb[i * 3 + 1]], LINEAR_OF_BYTE[rgb[i * 3 + 2]]);
  }
  return Y;
}

/** The p-th percentile (0..100) of `values`, picked as the probe picks it (nearest rank). */
export function percentile(values, p) {
  const a = Float64Array.from(values).sort();
  if (!a.length) return Number.NaN;
  return a[Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))))];
}

/**
 * The lighting statistics of one surface in the render: `inside` (mask ≥ insideAt), `base`
 * (the basePercentile of their luminance) and `lit` (inside, luminance ÷ base within litBand).
 */
export function surfaceStats(Y, mask, { insideAt, basePercentile, litBand } = DEFAULT_COMPOSE) {
  const inside = [];
  for (let i = 0; i < mask.length; i++) if (mask[i] >= insideAt) inside.push(i);
  const base = percentile(
    inside.map((i) => Y[i]),
    basePercentile,
  );
  const lit = base > 0 ? inside.filter((i) => Y[i] / base > litBand[0] && Y[i] / base < litBand[1]) : [];
  return { inside, base, lit };
}

/** `under` with `color(i)` (0..1 sRGB triple) laid over it at `alpha[i]`, as a new buffer. */
function blendOver(under, alpha, color) {
  const out = Buffer.from(under);
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i];
    if (a <= 0) continue;
    const c = color(i);
    for (let k = 0; k < 3; k++) {
      const v = a * c[k] + (1 - a) * (under[i * 3 + k] / 255);
      out[i * 3 + k] = Math.round(255 * Math.max(0, Math.min(1, v)));
    }
  }
  return out;
}

/**
 * The paste-back: the render inside `alpha` (0..1, already feathered), the photo everywhere
 * else — a pixel with alpha 0 is the photo's own pixel, byte for byte.
 */
export function pasteBack(photo, render, alpha) {
  return blendOver(photo, alpha, (i) => [render[i * 3] / 255, render[i * 3 + 1] / 255, render[i * 3 + 2] / 255]);
}

/**
 * The color lock over `under`: inside `alpha`, paint × `gain` (the part's light — lightGain) ×
 * (render luminance ÷ the surface's normally lit luminance `stats.base`), in linear light, clipped
 * at white. The render keeps only its light and shade; the hue and the lit level come from the
 * paint in the part's light.
 */
export function colorLock(under, render, alpha, paintHex, stats, Y = luminanceOf(render), gain = [1, 1, 1]) {
  const p = paintColor(paintHex);
  const paint = [toLinear(p.r) * gain[0], toLinear(p.g) * gain[1], toLinear(p.b) * gain[2]];
  const base = stats.base;
  return blendOver(under, alpha, (i) => paint.map((v) => toSrgb(Math.min(1, (v * Y[i]) / base))));
}

/**
 * How much of `alpha` the lock may cover: alpha × a 0–1 weight that is 0 where the render kept the
 * photo's pixel and 1 where the AI repainted it — the RGB distance relative to the two pixels'
 * brightness (`range`: where the ramp starts and ends; DEFAULT_COMPOSE.repaintedRange).
 */
export function repaintedAlpha(photo, render, alpha, [lo, hi]) {
  const out = new Float32Array(alpha.length);
  const span = Math.max(1e-6, hi - lo);
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i];
    if (a <= 0) continue;
    const dr = render[i * 3] - photo[i * 3];
    const dg = render[i * 3 + 1] - photo[i * 3 + 1];
    const db = render[i * 3 + 2] - photo[i * 3 + 2];
    const brightness = (render[i * 3] + render[i * 3 + 1] + render[i * 3 + 2] + photo[i * 3] + photo[i * 3 + 1] + photo[i * 3 + 2]) / 6;
    const change = Math.sqrt(dr * dr + dg * dg + db * db) / (brightness + 20);
    out[i] = a * Math.max(0, Math.min(1, (change - lo) / span));
  }
  return out;
}

/** Per-channel median of the pixels `idx` of an RGB buffer, as a culori rgb color. */
export function medianColor(rgb, idx) {
  if (!idx.length) return null;
  const k = Math.round(0.5 * (idx.length - 1));
  const med = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const hist = new Uint32Array(256);
    for (const i of idx) hist[rgb[i * 3 + c]]++;
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += hist[v];
      if (seen > k) {
        med[c] = v;
        break;
      }
    }
  }
  return { mode: "rgb", r: med[0] / 255, g: med[1] / 255, b: med[2] / 255 };
}

/**
 * The light on a surface, worked out from the paint it has NOW (`currentHex`): per channel, the
 * photo's median over its normally lit pixels `idx` ÷ that paint, in linear light, capped to
 * `limits` — the photo's real exposure and color cast (the painter's lightGain, src/services/
 * tint.js). [1, 1, 1] without a paint now or lit pixels.
 */
export function lightGain(photo, idx, currentHex, limits = DEFAULT_COMPOSE.gainLimits) {
  if (!currentHex || !idx.length) return [1, 1, 1];
  const seen = medianColor(photo, idx);
  const now = paintColor(currentHex);
  return [
    [seen.r, now.r],
    [seen.g, now.g],
    [seen.b, now.b],
  ].map(([s, n]) => {
    const lin = toLinear(n);
    const g = lin > 1e-4 ? toLinear(s) / lin : 1;
    return Math.min(limits[1], Math.max(limits[0], g));
  });
}

/** The paint `paintHex` in a part's light (`gain`) as #rrggbb, clipped at white — the chip at [1, 1, 1]. */
export function litHexOf(paintHex, gain) {
  if (gain.every((g) => g === 1)) return paintHex.toLowerCase();
  const p = paintColor(paintHex);
  return hexOf({ mode: "rgb", r: toSrgb(Math.min(1, toLinear(p.r) * gain[0])), g: toSrgb(Math.min(1, toLinear(p.g) * gain[1])), b: toSrgb(Math.min(1, toLinear(p.b) * gain[2])) });
}

/** #rrggbb of a culori rgb color. */
export function hexOf(c) {
  const h = (v) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** ΔE2000 between the paint and the median of the pixels `idx` of `rgb` (null when none). */
export function deltaEAt(rgb, idx, paintHex) {
  const m = medianColor(rgb, idx);
  return m ? { deltaE: de2000(paintColor(paintHex), m), median: hexOf(m) } : { deltaE: null, median: null };
}

// ── decode / encode (sharp) ────────────────────────────────────────────────────────────────

/** Decode an image (path or Buffer) to 8-bit RGB, EXIF-oriented, optionally resized to an exact size. */
export async function readRgb(input, size = null) {
  let img = sharp(input).rotate().removeAlpha().toColourspace("srgb");
  if (size) img = img.resize(size.width, size.height, { fit: "fill" });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Raw RGB → a sharp pipeline. */
export const fromRgb = (data, width, height) => sharp(data, { raw: { width, height, channels: 3 } });

/** Decode a mask (white = surface) to 0..1 coverage at an exact size. */
export async function readMask(input, width, height) {
  const data = await sharp(input)
    .rotate()
    .flatten({ background: "#000000" })
    .greyscale()
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer();
  const m = new Float32Array(width * height);
  for (let i = 0; i < m.length; i++) m[i] = data[i] / 255;
  return m;
}

/** A coverage mask softened by a Gaussian of `sigma` px (sharp's blur; 0 = unchanged). */
export async function featherMask(mask, width, height, sigma) {
  if (!(sigma > 0)) return mask;
  const bytes = Buffer.alloc(mask.length);
  for (let i = 0; i < mask.length; i++) bytes[i] = Math.round(mask[i] * 255);
  // sharp hands back 3 channels after a blur of 1-channel raw input — keep the first.
  const data = await sharp(bytes, { raw: { width, height, channels: 1 } })
    .blur(Math.max(0.3, sigma))
    .extractChannel(0)
    .raw()
    .toBuffer();
  if (data.length !== mask.length) throw new Error(`featherMask: ${data.length} bytes for ${mask.length} pixels`);
  const out = new Float32Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = data[i] / 255;
  return out;
}

/** The binary (0/255) PNG of several coverage masks' union, thresholded at `at`. */
export async function unionMaskPng(masks, width, height, path, at = 0.5) {
  const bytes = Buffer.alloc(width * height);
  for (const m of masks) for (let i = 0; i < bytes.length; i++) if (m[i] >= at) bytes[i] = 255;
  await sharp(bytes, { raw: { width, height, channels: 1 } })
    .png()
    .toFile(path);
}
