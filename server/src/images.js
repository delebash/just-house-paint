// SPDX-License-Identifier: MIT
// Taking a photo in: sharp (github.com/lovell/sharp, Apache-2.0) reads it, turns it upright from
// its EXIF orientation, and writes the three copies the app uses (files.js). A file sharp can't
// read as an image is refused before anything is written.

import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { displayPath, ensureHouseDirs, originalPath, thumbPath } from "./files.js";

/** What the app reads (sharp's own format names); HEIC needs libheif, which sharp's builds lack. */
export const ACCEPTED_FORMATS = { jpeg: "jpg", png: "png", webp: "webp" };

export class NotAnImage extends Error {}

/** The photo's format and upright size, or a NotAnImage refusal. */
export async function inspectPhoto(buffer) {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new NotAnImage("not an image file");
  }
  const ext = ACCEPTED_FORMATS[meta.format];
  if (!ext) throw new NotAnImage(`${meta.format || "this"} images can't be read — use JPEG, PNG or WebP`);
  // orientations 5–8 swap width and height
  const swap = meta.orientation >= 5 && meta.orientation <= 8;
  return { ext, width: swap ? meta.height : meta.width, height: swap ? meta.width : meta.height };
}

/** The size that fits inside `max` × `max`, keeping the aspect ratio (never enlarging). */
export function fitInside(width, height, max) {
  const s = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

/**
 * Write a house's three copies. `limits`: { displayMax, thumbMax, jpegQuality } — settings rows.
 * Returns { originalFile, width, height, displayWidth, displayHeight }.
 */
export async function ingestPhoto(buffer, dataDir, houseId, limits) {
  const { ext, width, height } = await inspectPhoto(buffer);
  ensureHouseDirs(dataDir, houseId);
  const originalFile = `original.${ext}`;
  const d = fitInside(width, height, limits.displayMax);
  const t = fitInside(width, height, limits.thumbMax);
  let upright;
  let display;
  let thumb;
  try {
    // The original upright, so every later step reads the same orientation. Only a photo its
    // camera stored sideways is re-encoded (a JPEG or WebP at high quality; a PNG losslessly — a
    // `quality` would turn on its 256-color palette); every other one is kept byte for byte.
    const { orientation } = await sharp(buffer).metadata();
    upright = orientation > 1 ? await sharp(buffer).rotate().toFormat(ext === "jpg" ? "jpeg" : ext, ext === "png" ? {} : { quality: 95 }).toBuffer() : buffer;
    display = await sharp(upright).resize(d.width, d.height).jpeg({ quality: limits.jpegQuality }).toBuffer();
    thumb = await sharp(upright).resize(t.width, t.height).jpeg({ quality: limits.jpegQuality }).toBuffer();
  } catch (e) {
    // its header read, its pixels didn't: a file cut off part-way, or one past sharp's pixel limit
    throw new NotAnImage(`this photo can't be read (${String(e?.message || e).split("\n")[0]})`);
  }
  // the three copies written only once all three were made (a disk error is the disk's, not "not a photo")
  writeFileSync(originalPath(dataDir, houseId, originalFile), upright);
  writeFileSync(displayPath(dataDir, houseId), display);
  writeFileSync(thumbPath(dataDir, houseId), thumb);
  return { originalFile, width, height, displayWidth: d.width, displayHeight: d.height };
}

/** An 8-bit mask (0–255, w×h) as a grayscale PNG. */
export function maskToPng(mask, width, height) {
  return sharp(Buffer.from(mask.buffer, mask.byteOffset, mask.byteLength), { raw: { width, height, channels: 1 } })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

/** A PNG (any channels) → an 8-bit mask at `width` × `height` (resized when it differs). */
export async function pngToMask(png, width, height) {
  const { data, info } = await sharp(png).resize(width, height, { fit: "fill" }).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  if (info.width !== width || info.height !== height) throw new Error("mask size mismatch");
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
