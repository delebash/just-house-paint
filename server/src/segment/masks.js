// SPDX-License-Identifier: MIT
// Full-size masks: one byte per photo pixel, 0 or 255, row-major, width × height (a Uint8Array).
// PNG in and out through sharp; set operations for the parts recipe.
import sharp from "sharp";

/** A mask → an 8-bit grayscale PNG (Buffer). */
export async function maskToPng(mask, width, height) {
  if (mask.length !== width * height) throw new RangeError(`mask is ${mask.length} bytes, not ${width}×${height}`);
  return sharp(mask, { raw: { width, height, channels: 1 } })
    .toColourspace("b-w") // else sharp writes a 1-channel raw as an RGB PNG
    .png({ compressionLevel: 6 })
    .toBuffer();
}

/** A PNG (path or Buffer; any channel count) → `{ mask, width, height }`, thresholded at 128 on its
 * first channel so anti-aliased or 0/1-scaled PNGs come back as 0/255. */
export async function pngToMask(png) {
  const { data, info } = await sharp(png).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i] >= 128 ? 255 : 0;
  return { mask, width: info.width, height: info.height };
}

/** Pixels set. */
export function maskArea(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) n++;
  return n;
}

/** The union of masks (null/undefined entries skipped); null when there are none. */
export function unionMasks(masks, length) {
  const list = masks.filter(Boolean);
  if (!list.length) return null;
  const out = new Uint8Array(length ?? list[0].length);
  for (const m of list) for (let i = 0; i < out.length; i++) if (m[i]) out[i] = 255;
  return out;
}

/** `base` minus `cut` (cut may be null): a new mask. */
export function subtractMask(base, cut) {
  const out = new Uint8Array(base.length);
  for (let i = 0; i < base.length; i++) out[i] = base[i] && !(cut?.[i]) ? 255 : 0;
  return out;
}

/**
 * `mask` grown by `r` pixels in every direction (a square), in O(n): a running count along each
 * row, then along each column. A new mask; r 0 is a copy.
 */
export function dilateMask(mask, width, height, r) {
  const rows = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  if (r <= 0) {
    for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 255 : 0;
    return out;
  }
  for (let y = 0; y < height; y++) {
    const o = y * width;
    let count = 0;
    for (let x = 0; x < Math.min(r, width); x++) if (mask[o + x]) count++;
    for (let x = 0; x < width; x++) {
      if (x + r < width && mask[o + x + r]) count++;
      if (count) rows[o + x] = 255;
      if (x - r >= 0 && mask[o + x - r]) count--;
    }
  }
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y < Math.min(r, height); y++) if (rows[y * width + x]) count++;
    for (let y = 0; y < height; y++) {
      if (y + r < height && rows[(y + r) * width + x]) count++;
      if (count) out[y * width + x] = 255;
      if (y - r >= 0 && rows[(y - r) * width + x]) count--;
    }
  }
  return out;
}

/** `a` where `b` is set too: a new mask. */
export function intersectMask(a, b) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] && b[i] ? 255 : 0;
  return out;
}

/** IoU of two full-size masks, sampled every `step` pixels each way (step 1 = exact). */
export function maskIoU(a, b, width, height, step = 1) {
  let inter = 0;
  let uni = 0;
  for (let y = 0; y < height; y += step) {
    const row = y * width;
    for (let x = 0; x < width; x += step) {
      const p = a[row + x] !== 0;
      const q = b[row + x] !== 0;
      if (p && q) inter++;
      if (p || q) uni++;
    }
  }
  return uni > 0 ? inter / uni : 0;
}

/** The sampling step samexporter's mask NMS uses at full size: the longest side read at ≤ 288. */
export const nmsStep = (width, height) => Math.max(1, Math.ceil(Math.max(width, height) / 288));

/** Mask-IoU NMS over full-size instances `{ score, mask }` (e.g. the same part found by two
 * prompts): best score first, a later instance overlapping a kept one by more than `iou` is dropped. */
export function dedupeInstances(instances, width, height, iou = 0.7) {
  const step = nmsStep(width, height);
  const sorted = [...instances].sort((a, b) => b.score - a.score);
  const kept = [];
  for (const inst of sorted) {
    if (!kept.some((k) => maskIoU(inst.mask, k.mask, width, height, step) > iou)) kept.push(inst);
  }
  return kept;
}
