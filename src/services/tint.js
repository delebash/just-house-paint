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
 * The box around a mask's pixels (any above 0), grown by `margin` on each side and kept inside the
 * photo: { x0, y0, w, h } (photo pixels); null for an empty mask.
 */
export function maskBox(mask, width, height, margin = 0) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x++) {
      if (!mask[row + x]) continue;
      if (first < 0) first = x;
      last = x;
    }
    if (first < 0) continue;
    if (y0 === height) y0 = y;
    y1 = y;
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
  }
  if (x1 < 0) return null;
  const left = Math.max(0, x0 - margin);
  const top = Math.max(0, y0 - margin);
  return { x0: left, y0: top, w: Math.min(width - 1, x1 + margin) - left + 1, h: Math.min(height - 1, y1 + margin) - top + 1 };
}

/** `values` (w×h) cut to `box` (maskBox's) — a new array of the same kind, box.w × box.h. */
function crop(values, width, box) {
  const out = new values.constructor(box.w * box.h);
  for (let y = 0; y < box.h; y++) out.set(values.subarray((box.y0 + y) * width + box.x0, (box.y0 + y) * width + box.x0 + box.w), y * box.w);
  return out;
}

/**
 * maskedBlur of `values` worked out only in `box` (maskBox's, grown by more than the radius — what
 * lies past it is outside the mask and adds nothing): the same numbers inside the box as the whole
 * photo's blur, in a box-sized array. A part's blur per Texture step was the whole photo's (2.2 s for
 * 15 parts at 2048 px, measured).
 */
function boxBlur(values, mask, width, box, radius) {
  return maskedBlur(crop(values, width, box), crop(mask, width, box), box.w, box.h, radius);
}

/** The values (Y) of a part's pixels (mask ≥ 128), in the photo's order, read inside its box. */
function insideValues(values, mask, width, box) {
  const inside = [];
  if (!box) return inside;
  for (let y = box.y0; y < box.y0 + box.h; y++)
    for (let i = y * width + box.x0, end = i + box.w; i < end; i++) if (mask[i] >= 128) inside.push(values[i]);
  return inside;
}

/**
 * What one part needs, computed once per photo and part: its pixels, its normally lit level and
 * (when texture < 1) its blurred lighting — worked out in the box around the part (`box`: the mask's
 * box grown by the blur's radius; `blurred` is that box's size). `mask` is a Uint8Array (0–255) the
 * photo's size. `calmY`: the part's calmed lighting already worked out for this photo and mask
 * (calmFinish doesn't depend on the texture, so a texture change keeps it). `exposure`: the photo's
 * bright end (photoExposure) — how dark a finish is, is judged against it, so a light house
 * photographed dark isn't taken for a dark one.
 */
export function preparePart({ Y, mask, width, height, texture = 1, blurRadius = 0, calmY = null, exposure = 1 }) {
  const radius = blurRadius || Math.max(2, Math.round(Math.min(width, height) / 150));
  // past the radius (and one more: the blur's running sum reads a pixel ahead) nothing reaches the part
  const box = maskBox(mask, width, height, Math.max(1, Math.round(radius)) + 1);
  const inside = insideValues(Y, mask, width, box);
  const base = Math.max(1e-4, percentile(inside, 75));
  const blurred = texture < 1 && box ? boxBlur(Y, mask, width, box, radius) : null;
  return { mask, base, texture, blurred, box, radius, pixels: inside.length, Y, width, height, calmY, exposure };
}

/** A box-sized array (`blurred`) read by the photo's pixel index. */
const boxReader = (values, width, box) => (i) => values[(((i / width) | 0) - box.y0) * box.w + (i % width) - box.x0];

/** The photo's bright end: the 95th percentile of its luminance (a sample of it) — the sky, white trim. Not
 *  the 99th: a dim photo's lamps or lit windows (1% of it) moved that, and the light houses read dark. */
export function photoExposure(Y) {
  const step = Math.max(1, Math.floor(Y.length / 200_000));
  const sample = [];
  for (let i = 0; i < Y.length; i += step) sample.push(Y[i]);
  return Math.max(1e-4, percentile(sample, 95));
}

/** CIE L* (0–100) of a relative luminance. */
const lstar = (y) => (y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y);
const smoothstep = (e0, e1, v) => {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** When and how much an old finish is calmed (RESEARCH §13, measured on the probe houses): a part
 *  whose normally lit level — against the photo's bright end — is darker than L* `dark[1]` (fully at
 *  `dark[0]`), painted lighter by more than `lighter[0]` L* (fully at `lighter[1]`). `keep` of the old detail stays; detail darker than
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

/** How much of `part`'s old finish paint `hex` hides: 0 for a light finish or a paint not much lighter
 *  than it, up to 1 for a dark one painted light (CALM). The finish is the paint the part has now
 *  (`current`, #rrggbb) when its owner said so — exact, whatever the photo's light — else read from the
 *  photo against its bright end (a light house photographed dark stays a light finish). Both are compared
 *  as normally lit paints, never as this photo's exposure shows them. */
export function calmStrength(part, hex, current = null) {
  const finish = current ? lstar(lum(...paintLinear(current))) : lstar(Math.min(1, part.base / (part.exposure || 1)));
  const dark = 1 - smoothstep(CALM.dark[0], CALM.dark[1], finish);
  if (dark <= 0) return 0;
  return dark * smoothstep(CALM.lighter[0], CALM.lighter[1], lstar(lum(...paintLinear(hex))) - finish);
}

/** The part's calmed lighting, computed the first time a paint needs it and kept with the part. */
function calmed(part) {
  if (!part.calm) {
    const { Y, mask, width, height, texture, radius, box } = part;
    const cY = part.calmY || calmFinish({ Y, mask, width, height });
    part.calmY = cY;
    part.calm = {
      Y: cY,
      base: Math.max(1e-4, percentile(insideValues(cY, mask, width, box), 75)),
      blurred: texture < 1 && box ? boxBlur(cY, mask, width, box, radius) : null,
    };
  }
  return part.calm;
}

/**
 * How lit each pixel of `part` is for paint `hex` (on a part whose paint now is `current`), as a function
 * of the pixel index: its lighting ÷ the part's normally lit level — the photo's own, through the
 * texture setting, with the old finish calmed by calmStrength.
 */
export function partLight(part, hex, current = null) {
  const { Y, base, texture, width, box } = part;
  const blurred = part.blurred && boxReader(part.blurred, width, box);
  const s = calmStrength(part, hex, current);
  if (s <= 0) return blurred ? (i) => (texture * Y[i] + (1 - texture) * blurred(i)) / base : (i) => Y[i] / base;
  const cal = calmed(part);
  const level = base ** (1 - s) * cal.base ** s;
  const lit = s >= 1 ? (i) => cal.Y[i] : (i) => Y[i] ** (1 - s) * cal.Y[i] ** s;
  if (!blurred) return (i) => lit(i) / level;
  const calBlurred = boxReader(cal.blurred, width, box);
  return (i) => (texture * lit(i) + (1 - texture) * ((1 - s) * blurred(i) + s * calBlurred(i))) / level;
}

/**
 * Paint one part into `out` (RGBA, the photo's size), reading the photo's own pixels from
 * `photo`. Pixels outside the mask are left as they are in `out`; the mask's soft edge blends.
 */
export function tintPart({ photo, out, part, hex, gain = [1, 1, 1], current = null }) {
  const [pr0, pg0, pb0] = paintLinear(hex);
  // the light the paint on it now says falls there (lightGain): the photo's exposure and its color cast
  const pr = pr0 * gain[0];
  const pg = pg0 * gain[1];
  const pb = pb0 * gain[2];
  const { mask } = part;
  const light = partLight(part, hex, current);
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
 * `assignments`: [{ part, hex, gain?, current? }]. Returns a new RGBA array; `photo` is not changed.
 */
export function tintPhoto({ photo, assignments }) {
  const out = new Uint8ClampedArray(photo);
  for (const { part, hex, gain, current } of assignments) if (hex) tintPart({ photo, out, part, hex, gain, current });
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
export function partTones({ part, hex, k = 1, gain = [1, 1, 1], current = null }) {
  const ratios = [];
  const light = partLight(part, hex, current);
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
 * ±10% of its base level, in the light the part was painted with: `paint` on a part whose paint now
 * is `current`) in `tinted`.
 * Below 1 is not visible to most people; below 2 is a close match. null when no pixel is lit.
 */
export function chipDeltaE({ tinted, part, hex, paint = hex, current = null }) {
  const rs = [];
  const gs = [];
  const bs = [];
  const light = partLight(part, paint, current);
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
