// SPDX-License-Identifier: MIT
// The paint on the photo — the ratio tint (RESEARCH §9: lit ΔE 0.33–0.64 on the probe photos,
// against 6–11 for a plain multiply and 5–47 for the CSS "color" blend). Inside a part's mask
// each pixel becomes the paint's color scaled by how lit that pixel is compared with the part's
// normally lit level, in linear light:
//
//     out = paint × (Y_pixel ÷ Y_base)        Y_base = the 75th percentile of Y inside the part
//
// so a normally lit pixel shows the paint chip exactly and shadows, texture and lap lines keep
// their shape. A dark finish painted much lighter first loses its blotches and grain (calmFinish:
// paint hides the old finish's own colors, not the boards' shadows — RESEARCH §13). `texture`
// (0–1) blends each pixel's lighting toward a blurred copy of it inside the part: 1 keeps the
// photo's texture whole; lower values calm what is left, at the cost of fine detail.
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
 * `calmY`: the part's calmed lighting already worked out for this photo and mask (calmFinish doesn't
 * depend on the texture, so a texture change keeps it).
 */
export function preparePart({ Y, mask, width, height, texture = 1, blurRadius = 0, calmY = null }) {
  const inside = [];
  for (let i = 0; i < mask.length; i++) if (mask[i] >= 128) inside.push(Y[i]);
  const base = Math.max(1e-4, percentile(inside, 75));
  const radius = blurRadius || Math.max(2, Math.round(Math.min(width, height) / 150));
  const blurred = texture < 1 ? maskedBlur(Y, mask, width, height, radius) : null;
  return { mask, base, texture, blurred, radius, pixels: inside.length, Y, width, height, calmY };
}

/** CIE L* (0–100) of a relative luminance. */
const lstar = (y) => (y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y);
const smoothstep = (e0, e1, v) => {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** When and how much an old finish is calmed (RESEARCH §13, measured on the probe houses): a part
 *  whose normally lit level is darker than L* `dark[1]` (fully at `dark[0]`), painted lighter by more
 *  than `lighter[0]` L* (fully at `lighter[1]`). `keep` of the old detail stays; detail darker than
 *  e^−`shadow` of its line (shadows, knots) keeps what goes past that. The light houses (L* 52–79)
 *  are never calmed: there the same smoothing smeared real tree shadows and the trim's scallops. */
export const CALM = Object.freeze({ dark: [30, 45], lighter: [15, 40], keep: 0.15, shadow: 0.5 });

/**
 * A dark finish's lighting with its own blotches and grain taken out — what is left when paint
 * covers it: the part's large-scale light (a masked blur a 25th of the photo's short side wide)
 * times its detail averaged along the boards (the direction of least change, from the structure
 * tensor of ln Y — weatherboard, lap and board-and-batten siding at any slant), so the lines between
 * boards stay and the mottling along them goes. Where the part has no direction (stucco, brick:
 * coherence under 0.2) its detail is kept whole. Returns a new Float32Array (Y outside the mask).
 */
export function calmFinish({ Y, mask, width: w, height: h }) {
  const n = w * h;
  const short = Math.min(w, h);
  const reach = Math.max(4, Math.round(short / 25));
  // the light and the boards' direction are smooth: worked out on a grid `f` times coarser
  const f = Math.max(1, Math.round(short / 400));
  const lightAt = coarseBlur([Y], mask, w, h, f, reach)[0];
  const lnY = new Float32Array(n);
  const d = new Float32Array(n);
  const light = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue; // its soft edge too: the tint blends it in
      light[i] = Math.max(lightAt(x, y), 1e-5);
      lnY[i] = Math.log(Math.max(Y[i], 1e-5));
      d[i] = lnY[i] - Math.log(light[i]);
    }
  }
  // the structure tensor of ln Y inside the part, smoothed
  const jxx = new Float32Array(n);
  const jxy = new Float32Array(n);
  const jyy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] < 128) continue;
      const gx = mask[i + 1] >= 128 && mask[i - 1] >= 128 ? (lnY[i + 1] - lnY[i - 1]) / 2 : 0;
      const gy = mask[i + w] >= 128 && mask[i - w] >= 128 ? (lnY[i + w] - lnY[i - w]) / 2 : 0;
      jxx[i] = gx * gx;
      jxy[i] = gx * gy;
      jyy[i] = gy * gy;
    }
  }
  const [aAt, bAt, cAt] = coarseBlur([jxx, jxy, jyy], mask, w, h, f, Math.max(2, Math.round(short / 150)));
  const step = Math.max(1, Math.round(reach / 30));
  const out = Float32Array.from(Y);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const a = aAt(x, y);
      const b = bAt(x, y);
      const c = cAt(x, y);
      const half = Math.hypot((a - c) / 2, b);
      const coherence = (2 * half) / (a + c + 1e-12);
      const phi = 0.5 * Math.atan2(2 * b, a - c); // across the lines
      const tx = -Math.sin(phi);
      const ty = Math.cos(phi);
      let sum = 0;
      let k = 0;
      for (let j = -reach; j <= reach; j += step) {
        const xx = (x + j * tx + 0.5) | 0;
        const yy = (y + j * ty + 0.5) | 0;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx;
        if (mask[q] < 128) continue;
        sum += d[q];
        k++;
      }
      const along = k ? sum / k : d[i];
      const keep = 1 - (1 - CALM.keep) * smoothstep(0.2, 0.5, coherence);
      const rest = d[i] - along;
      out[i] = light[i] * Math.exp(along + keep * rest + (1 - keep) * Math.min(0, rest + CALM.shadow));
    }
  }
  return out;
}

/**
 * The masked blur (radius `radius`, full-size pixels) of each array in `fields`, worked out on a grid
 * `f` times coarser — each cell the mask-weighted mean of its f×f pixels, blurred with its coverage as
 * the weight — and read back per full-size pixel with bilinear interpolation: `at(x, y)` per field.
 * For fields that are smooth at that scale; f = 1 is maskedBlur itself.
 */
function coarseBlur(fields, mask, w, h, f, radius) {
  const cw = Math.ceil(w / f);
  const ch = Math.ceil(h / f);
  const cover = new Float32Array(cw * ch);
  const sums = fields.map(() => new Float32Array(cw * ch));
  for (let y = 0; y < h; y++) {
    const row = ((y / f) | 0) * cw;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = mask[i] / 255;
      if (!m) continue;
      const cell = row + ((x / f) | 0);
      cover[cell] += m;
      for (let k = 0; k < fields.length; k++) sums[k][cell] += fields[k][i] * m;
    }
  }
  const weight = cover.map((c) => (255 * c) / (f * f));
  const r = Math.max(1, Math.round(radius / f));
  return sums.map((sum) => {
    const mean = sum.map((s, cell) => (cover[cell] ? s / cover[cell] : 0));
    const grid = maskedBlur(mean, weight, cw, ch, r);
    return (x, y) => {
      const gx = Math.min(cw - 1, Math.max(0, (x + 0.5) / f - 0.5));
      const gy = Math.min(ch - 1, Math.max(0, (y + 0.5) / f - 0.5));
      const x0 = gx | 0;
      const y0 = gy | 0;
      const x1 = Math.min(cw - 1, x0 + 1);
      const y1 = Math.min(ch - 1, y0 + 1);
      const tx = gx - x0;
      const ty = gy - y0;
      const top = grid[y0 * cw + x0] * (1 - tx) + grid[y0 * cw + x1] * tx;
      const bottom = grid[y1 * cw + x0] * (1 - tx) + grid[y1 * cw + x1] * tx;
      return top * (1 - ty) + bottom * ty;
    };
  });
}

/** How much of `part`'s old finish paint `hex` (in the light `gain`) hides: 0 for a light finish or a
 *  paint not much lighter than it, up to 1 for a dark one painted light (CALM). */
export function calmStrength(part, hex, gain = [1, 1, 1]) {
  const [r, g, b] = paintLinear(hex);
  const finish = lstar(part.base);
  const dark = 1 - smoothstep(CALM.dark[0], CALM.dark[1], finish);
  if (dark <= 0) return 0;
  return dark * smoothstep(CALM.lighter[0], CALM.lighter[1], lstar(lum(r * gain[0], g * gain[1], b * gain[2])) - finish);
}

/** The part's calmed lighting, computed the first time a paint needs it and kept with the part. */
function calmed(part) {
  if (!part.calm) {
    const { Y, mask, width, height, texture, radius } = part;
    const cY = part.calmY || calmFinish({ Y, mask, width, height });
    part.calmY = cY;
    const inside = [];
    for (let i = 0; i < mask.length; i++) if (mask[i] >= 128) inside.push(cY[i]);
    part.calm = {
      Y: cY,
      base: Math.max(1e-4, percentile(inside, 75)),
      blurred: texture < 1 ? maskedBlur(cY, mask, width, height, radius) : null,
    };
  }
  return part.calm;
}

/**
 * How lit each pixel of `part` is for paint `hex` (in the light `gain`), as a function of the pixel
 * index: its lighting ÷ the part's normally lit level — the photo's own, through the texture
 * setting, with the old finish calmed by calmStrength.
 */
export function partLight(part, hex, gain = [1, 1, 1]) {
  const { Y, base, texture, blurred } = part;
  const s = calmStrength(part, hex, gain);
  if (s <= 0) return blurred ? (i) => (texture * Y[i] + (1 - texture) * blurred[i]) / base : (i) => Y[i] / base;
  const cal = calmed(part);
  const level = base ** (1 - s) * cal.base ** s;
  const lit = s >= 1 ? (i) => cal.Y[i] : (i) => Y[i] ** (1 - s) * cal.Y[i] ** s;
  if (!blurred) return (i) => lit(i) / level;
  return (i) => (texture * lit(i) + (1 - texture) * ((1 - s) * blurred[i] + s * cal.blurred[i])) / level;
}

/**
 * Paint one part into `out` (RGBA, the photo's size), reading the photo's own pixels from
 * `photo`. Pixels outside the mask are left as they are in `out`; the mask's soft edge blends.
 */
export function tintPart({ photo, out, part, hex, gain = [1, 1, 1] }) {
  const [pr0, pg0, pb0] = paintLinear(hex);
  // the light the paint on it now says falls there (lightGain): the photo's exposure and its color cast
  const pr = pr0 * gain[0];
  const pg = pg0 * gain[1];
  const pb = pb0 * gain[2];
  const { mask } = part;
  const light = partLight(part, hex, gain);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const m = mask[i];
    if (m === 0) continue;
    const ratio = light(i);
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
export function tintPhoto({ photo, assignments }) {
  const out = new Uint8ClampedArray(photo);
  for (const { part, hex, gain } of assignments) if (hex) tintPart({ photo, out, part, hex, gain });
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

/** How far the light on a part may differ from the chip's, per channel, from the paint on it now:
 *  a wrong pick can't turn the picture to nonsense. The AI photo's lock uses the same cap
 *  (server/src/aiphoto/pixels.js DEFAULT_COMPOSE.gainLimits). */
export const GAIN_LIMITS = Object.freeze([0.25, 4]);

/** The paint `hex` in a part's light (`gain`, lightGain's) as #rrggbb — what its normally lit pixels
 *  show; the chip itself when the gain is [1, 1, 1]. */
export function litHex(hex, gain = [1, 1, 1]) {
  if (gain.every((g) => g === 1)) return hex;
  const lin = paintLinear(hex);
  return `#${lin.map((v, c) => Math.round(255 * toSrgb(v * gain[c])).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The light on a part, worked out from the paint it has NOW (`currentHex`, when its owner knows it):
 * on the part's normally lit pixels (lighting within ±10% of its base level) the camera recorded
 * that paint as the photo's color there, so per channel the light is (the photo's median there) ÷
 * (the paint's own color) — the photo's real exposure and its color cast (overcast and shade light
 * is bluish). A new paint × this gain shows as the camera would have recorded it. Linear light;
 * [1, 1, 1] without a current paint or lit pixels.
 */
export function lightGain({ photo, Y, part, currentHex }) {
  if (!currentHex) return [1, 1, 1];
  const ch = [[], [], []];
  for (let i = 0, p = 0; i < part.mask.length; i++, p += 4) {
    if (part.mask[i] < 255) continue;
    const ratio = Y[i] / part.base;
    if (ratio < 0.9 || ratio > 1.1) continue;
    ch[0].push(TO_LINEAR[photo[p]]);
    ch[1].push(TO_LINEAR[photo[p + 1]]);
    ch[2].push(TO_LINEAR[photo[p + 2]]);
  }
  if (!ch[0].length) return [1, 1, 1];
  const now = paintLinear(currentHex);
  return ch.map((values, c) => {
    const seen = percentile(values, 50);
    const g = now[c] > 1e-4 ? seen / now[c] : 1;
    return Math.min(GAIN_LIMITS[1], Math.max(GAIN_LIMITS[0], g));
  });
}

/** Where on a part the tones are read: the light that falls on its shaded quarter, its middle, and
 *  its normally lit level (the chip by definition — RESEARCH §9). */
export const TONE_PERCENTILES = Object.freeze({ shade: 20, middle: 50, light: 75 });

/**
 * The paint `hex` as it shows on this part in shade, on most of it and in light — the chip scaled
 * by the light that falls there (partLight), through the Light setting `k`.
 * Returns { shade, middle, light } as #rrggbb.
 */
export function partTones({ part, hex, k = 1, gain = [1, 1, 1] }) {
  const ratios = [];
  const light = partLight(part, hex, gain);
  for (let i = 0; i < part.mask.length; i++) if (part.mask[i] === 255) ratios.push(light(i));
  const [pr, pg, pb] = paintLinear(hex).map((v, c) => v * gain[c]);
  const toHex = (ratio) =>
    `#${[pr, pg, pb].map((c) => Math.round(255 * toSrgb(c * ratio * k)).toString(16).padStart(2, "0")).join("")}`;
  const out = {};
  for (const [name, q] of Object.entries(TONE_PERCENTILES)) out[name] = toHex(ratios.length ? percentile(ratios, q) : 1);
  return out;
}

/**
 * How close the painted part reads to the paint: ΔE2000 between `hex` (the chip, or the chip in the
 * part's light — litHex) and the median color of the part's normally lit pixels (lighting within
 * ±10% of its base level) in `tinted`.
 * Below 1 is not visible to most people; below 2 is a close match. null when no pixel is lit.
 */
export function chipDeltaE({ tinted, part, hex }) {
  const rs = [];
  const gs = [];
  const bs = [];
  const light = partLight(part, hex);
  for (let i = 0, p = 0; i < part.mask.length; i++, p += 4) {
    if (part.mask[i] < 255) continue;
    const ratio = light(i);
    if (ratio < 0.9 || ratio > 1.1) continue;
    rs.push(tinted[p]);
    gs.push(tinted[p + 1]);
    bs.push(tinted[p + 2]);
  }
  if (!rs.length) return null;
  const med = (a) => percentile(a, 50) / 255;
  return differenceCiede2000()(parse(hex), { mode: "rgb", r: med(rs), g: med(gs), b: med(bs) });
}
