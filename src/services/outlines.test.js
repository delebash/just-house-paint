// SPDX-License-Identifier: MIT
// The parts' outlines (services/outlines.js): each edge a light line with a dark one just outside it,
// so it shows on a white house as on a dark one; the selected part yellow and on top.
import { expect, test } from "vitest";
import { outlinePixels } from "./outlines.js";

const W = 7;
const H = 7;
/** A mask with the box x0..x1 × y0..y1 inside. */
function box(x0, y0, x1, y1) {
  const m = new Uint8Array(W * H);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * W + x] = 255;
  return m;
}
const px = (rgba, x, y) => [...rgba.slice((y * W + x) * 4, (y * W + x) * 4 + 4)];

test("a part's edge is light, with a dark line just outside it; inside and far outside stay clear", () => {
  const masks = { body: box(2, 2, 4, 4) };
  const rgba = outlinePixels((k) => masks[k], ["body"], null, W, H);
  expect(px(rgba, 2, 2)).toEqual([255, 255, 255, 150]); // the edge: white at ~60 %
  expect(px(rgba, 1, 3)).toEqual([0, 0, 0, 150]); // just outside: as strong, black
  expect(px(rgba, 3, 3)).toEqual([0, 0, 0, 0]); // the middle
  expect(px(rgba, 0, 0)).toEqual([0, 0, 0, 0]); // far outside
});

test("the selected part is yellow and opaque on a black edge, and a neighbour's dark line never covers a light one", () => {
  // body on the left, trim right beside it: their edges touch
  const masks = { body: box(1, 1, 3, 5), trim: box(4, 1, 5, 5) };
  const rgba = outlinePixels((k) => masks[k], ["body", "trim"], "trim", W, H);
  expect(px(rgba, 4, 3)).toEqual([255, 204, 0, 255]); // trim's edge: the selected yellow
  expect(px(rgba, 6, 3)).toEqual([0, 0, 0, 255]); // outside trim: opaque black
  // where they meet, body's edge pixel is trim's outside: the selected part's dark line is on top
  expect(px(rgba, 3, 3)).toEqual([0, 0, 0, 255]);
  // two parts not selected: each one's light line is kept where the other's dark line would fall
  const both = outlinePixels((k) => masks[k], ["body", "trim"], null, W, H);
  expect(px(both, 3, 3)).toEqual([255, 255, 255, 150]);
  expect(px(both, 4, 3)).toEqual([255, 255, 255, 150]);
  expect(px(both, 0, 3)).toEqual([0, 0, 0, 150]);
});

test("a part with no mask yet is skipped", () => {
  const rgba = outlinePixels(() => null, ["body"], "body", W, H);
  expect(rgba.every((v) => v === 0)).toBe(true);
});
