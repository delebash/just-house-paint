// SPDX-License-Identifier: MIT
// The parts' outlines over the photo (the house page's Outlines): each part's edge as a light line
// with a dark line just outside it — the two-tone edge selection tools draw ("marching ants"), so an
// outline shows on a white wall as on a dark one. The selected part's line is yellow and opaque, the
// others' white at ~60 %, each dark line as strong as its light one. Drawn in four passes — the other
// parts' dark lines, their light lines, the selected part's dark line, its light line — so a part's
// light line is never covered by a neighbour's dark one, and the selected part is on top.

const LIGHT = [255, 255, 255, 150];
const LIGHT_SELECTED = [255, 204, 0, 255];
const DARK = [0, 0, 0, 150];
const DARK_SELECTED = [0, 0, 0, 255];

/** One part's edge: the pixels inside the mask with a neighbour outside it (`inner`), and those
 *  neighbours (`outer`). The photo's own border is left out, as a part never ends there. */
function edgeOf(mask, w, h) {
  const inner = [];
  const outer = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] < 128) continue;
      const before = outer.length;
      if (mask[i - 1] < 128) outer.push(i - 1);
      if (mask[i + 1] < 128) outer.push(i + 1);
      if (mask[i - w] < 128) outer.push(i - w);
      if (mask[i + w] < 128) outer.push(i + w);
      if (outer.length > before) inner.push(i);
    }
  return { inner, outer };
}

function paint(rgba, pixels, [r, g, b, a]) {
  for (const i of pixels) {
    const p = i * 4;
    rgba[p] = r;
    rgba[p + 1] = g;
    rgba[p + 2] = b;
    rgba[p + 3] = a;
  }
}

/**
 * The outlines of `keys`' parts as RGBA pixels (w × h).
 * @param {(key: string) => Uint8Array | null} maskOf a part's mask (≥128 is inside), or null
 * @param {string[]} keys the parts to outline
 * @param {string | null} selected the selected part's key
 */
export function outlinePixels(maskOf, keys, selected, w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const others = [];
  let chosen = null;
  for (const key of keys) {
    const mask = maskOf(key);
    if (!mask) continue;
    if (key === selected) chosen = edgeOf(mask, w, h);
    else others.push(edgeOf(mask, w, h));
  }
  for (const e of others) paint(rgba, e.outer, DARK);
  for (const e of others) paint(rgba, e.inner, LIGHT);
  if (chosen) {
    paint(rgba, chosen.outer, DARK_SELECTED);
    paint(rgba, chosen.inner, LIGHT_SELECTED);
  }
  return rgba;
}
