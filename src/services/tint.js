// SPDX-License-Identifier: MIT
// The paint on the photo — the ratio tint (RESEARCH §9: lit ΔE 0.33–0.64 on the probe photos,
// against 6–11 for a plain multiply and 5–47 for the CSS "color" blend). Inside a part's mask
// each pixel becomes the paint's color scaled by how lit that pixel is compared with the part's
// normally lit level, in linear light:
//
//     out = paint × (Y_pixel ÷ Y_base)        Y_base = the 75th percentile of Y inside the part
//
// so a normally lit pixel shows the paint chip exactly and shadows, texture and lap lines keep
// their shape. `texture` (0–1) blends each pixel's lighting toward a blurred copy of it inside the
// part: 1 keeps the photo's texture whole; lower values calm the old finish's grain (the open
// dark-to-light problem, RESEARCH §10 round 2) at the cost of fine detail.
//
// Pure functions over canvas pixel arrays (RGBA Uint8ClampedArray, as Canvas 2D's ImageData
// gives them — developer.mozilla.org/docs/Web/API/ImageData), so the same code tints the display
// copy live and the full-size photo for export.

import { differenceCiede2000, parse } from "culori";

// sRGB transfer functions (IEC 61966-2-1), as a 256-entry table one way and the formula the other.
const TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export const toLinear8 = (v) => TO_LINEAR[v];
export function toSrgb(lin) {
  const c = lin <= 0 ? 0 : lin >= 1 ? 1 : lin;
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** Relative luminance (Rec. 709 primaries — sRGB's) of linear r, g, b. */
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** The paint's linear RGB from a hex string ("#ad2c34"). */
export function paintLinear(hex) {
  const c = parse(hex);
  if (c?.mode !== "rgb") throw new Error(`not a color: ${hex}`);
  return [c.r, c.g, c.b].map((v) => {
    const x = Math.max(0, Math.min(1, v));
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
}

/** Each pixel's linear luminance (Float32Array w×h) — computed once per photo. */
export function luminance(rgba) {
  const n = rgba.length / 4;
  const Y = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) Y[i] = lum(TO_LINEAR[rgba[p]], TO_LINEAR[rgba[p + 1]], TO_LINEAR[rgba[p + 2]]);
  return Y;
}

/** The `q`-th percentile (0–100) of a numeric array (nearest rank). */
export function percentile(values, q) {
  if (!values.length) return 0;
  const sorted = Float32Array.from(values).sort();
  const k = Math.min(sorted.length - 1, Math.max(0, Math.round((q / 100) * (sorted.length - 1))));
  return sorted[k];
}

/**
 * Box-blur `values` (w×h) inside `mask` only — a normalized blur, so the part's edge never
 * blends in the lighting of what surrounds it. Separable, with running sums: O(n) per radius.
 */
export function maskedBlur(values, mask, w, h, radius) {
  const r = Math.max(1, Math.round(radius));
  const src = new Float32Array(values.length);
  const wgt = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const m = mask[i] / 255;
    src[i] = values[i] * m;
    wgt[i] = m;
  }
  const pass = (a, horizontal) => {
    const out = new Float32Array(a.length);
    const lines = horizontal ? h : w;
    const len = horizontal ? w : h;
    const step = horizontal ? 1 : w;
    for (let line = 0; line < lines; line++) {
      const start = horizontal ? line * w : line;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[start + Math.min(len - 1, Math.max(0, k)) * step];
      for (let j = 0; j < len; j++) {
        out[start + j * step] = sum;
        sum += a[start + Math.min(len - 1, j + r + 1) * step] - a[start + Math.max(0, j - r) * step];
      }
    }
    return out;
  };
  const s = pass(pass(src, true), false);
  const ws = pass(pass(wgt, true), false);
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = ws[i] > 1e-6 ? s[i] / ws[i] : values[i];
  return out;
}

/**
 * What one part needs, computed once per photo and part: its pixels, its normally lit level and
 * (when texture < 1) its blurred lighting. `mask` is a Uint8Array (0–255) the photo's size.
 */
export function preparePart({ Y, mask, width, height, texture = 1, blurRadius = 0 }) {
  const inside = [];
  for (let i = 0; i < mask.length; i++) if (mask[i] >= 128) inside.push(Y[i]);
  const base = Math.max(1e-4, percentile(inside, 75));
  const radius = blurRadius || Math.max(2, Math.round(Math.min(width, height) / 150));
  const blurred = texture < 1 ? maskedBlur(Y, mask, width, height, radius) : null;
  return { mask, base, texture, blurred, pixels: inside.length };
}

/**
 * Paint one part into `out` (RGBA, the photo's size), reading the photo's own pixels from
 * `photo`. Pixels outside the mask are left as they are in `out`; the mask's soft edge blends.
 */
export function tintPart({ photo, out, Y, part, hex }) {
  const [pr, pg, pb] = paintLinear(hex);
  const { mask, base, texture, blurred } = part;
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const m = mask[i];
    if (m === 0) continue;
    const y = blurred ? texture * Y[i] + (1 - texture) * blurred[i] : Y[i];
    const ratio = y / base;
    const r = 255 * toSrgb(pr * ratio);
    const g = 255 * toSrgb(pg * ratio);
    const b = 255 * toSrgb(pb * ratio);
    if (m === 255) {
      out[p] = r;
      out[p + 1] = g;
      out[p + 2] = b;
    } else {
      const a = m / 255;
      out[p] = a * r + (1 - a) * photo[p];
      out[p + 1] = a * g + (1 - a) * photo[p + 1];
      out[p + 2] = a * b + (1 - a) * photo[p + 2];
    }
    out[p + 3] = 255;
  }
  return out;
}

/**
 * Paint every assigned part, in order (later parts paint over earlier ones where masks overlap).
 * `assignments`: [{ part, hex }]. Returns a new RGBA array; `photo` is not changed.
 */
export function tintPhoto({ photo, Y, assignments }) {
  const out = new Uint8ClampedArray(photo);
  for (const { part, hex } of assignments) if (hex) tintPart({ photo, out, Y, part, hex });
  return out;
}

/**
 * The Light setting as a lookup table: each 8-bit value through linear light × `k` and back — a
 * brighter (k > 1) or duller (k < 1) day over the whole picture, photo and paint alike, the same
 * at every pixel, so shadows keep their shape. k = 1 is the photo's own light.
 */
export function lightTable(k) {
  const t = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) t[v] = Math.round(255 * toSrgb(TO_LINEAR[v] * k));
  return t;
}

/** `rgba` (in place) through the Light setting `k`; alpha untouched. */
export function applyLight(rgba, k) {
  if (k === 1) return rgba;
  const t = lightTable(k);
  for (let p = 0; p < rgba.length; p += 4) {
    rgba[p] = t[rgba[p]];
    rgba[p + 1] = t[rgba[p + 1]];
    rgba[p + 2] = t[rgba[p + 2]];
  }
  return rgba;
}

/** Where on a part the tones are read: the light that falls on its shaded quarter, its middle, and
 *  its normally lit level (the chip by definition — RESEARCH §9). */
export const TONE_PERCENTILES = Object.freeze({ shade: 20, middle: 50, light: 75 });

/**
 * The paint `hex` as it shows on this part in shade, on most of it and in light — the chip scaled
 * by the light that falls there (ratio = Y ÷ the part's base level), through the Light setting `k`.
 * Returns { shade, middle, light } as #rrggbb.
 */
export function partTones({ Y, part, hex, k = 1 }) {
  const ratios = [];
  for (let i = 0; i < part.mask.length; i++) if (part.mask[i] === 255) ratios.push(Y[i] / part.base);
  const [pr, pg, pb] = paintLinear(hex);
  const toHex = (ratio) =>
    `#${[pr, pg, pb].map((c) => Math.round(255 * toSrgb(c * ratio * k)).toString(16).padStart(2, "0")).join("")}`;
  const out = {};
  for (const [name, q] of Object.entries(TONE_PERCENTILES)) out[name] = toHex(ratios.length ? percentile(ratios, q) : 1);
  return out;
}

/**
 * How close the painted part reads to the paint chip: ΔE2000 between the paint and the median
 * color of the part's normally lit pixels (lighting within ±10% of its base level) in `tinted`.
 * Below 1 is not visible to most people; below 2 is a close match. null when no pixel is lit.
 */
export function chipDeltaE({ tinted, Y, part, hex }) {
  const rs = [];
  const gs = [];
  const bs = [];
  for (let i = 0, p = 0; i < part.mask.length; i++, p += 4) {
    if (part.mask[i] < 255) continue;
    const ratio = Y[i] / part.base;
    if (ratio < 0.9 || ratio > 1.1) continue;
    rs.push(tinted[p]);
    gs.push(tinted[p + 1]);
    bs.push(tinted[p + 2]);
  }
  if (!rs.length) return null;
  const med = (a) => percentile(a, 50) / 255;
  return differenceCiede2000()(parse(hex), { mode: "rgb", r: med(rs), g: med(gs), b: med(bs) });
}
