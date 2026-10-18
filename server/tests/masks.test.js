// SPDX-License-Identifier: MIT
// The touch-up operations on part masks (src/services/masks.js).
import { expect, test } from "vitest";
import { area, assignRegion, outline, overlayPixels, stampCircle, stroke, subtractRegion } from "../src/shared/masks.js";

const W = 50;
const H = 40;
const blank = () => new Uint8Array(W * H);

test("the brush adds a disc and the eraser takes it back", () => {
  const m = blank();
  stampCircle(m, W, H, 25, 20, 5, 255);
  const a = area(m);
  expect(a).toBeGreaterThan(Math.PI * 4.5 ** 2);
  expect(a).toBeLessThan(Math.PI * 5.5 ** 2);
  expect(m[20 * W + 25]).toBe(255);
  stampCircle(m, W, H, 25, 20, 6, 0);
  expect(area(m)).toBe(0);
});

test("a stroke leaves no gaps between far-apart points; brushing at the edge doesn't spill", () => {
  const m = blank();
  stroke(m, W, H, [{ x: 2, y: 20 }, { x: 47, y: 20 }], 2, "paint");
  for (let x = 2; x <= 47; x++) expect(m[20 * W + x]).toBe(255);
  const edge = blank();
  stroke(edge, W, H, [{ x: 0, y: 0 }], 10, "paint");
  expect(edge[0]).toBe(255);
});

test("a region moves to its new part and leaves the others", () => {
  const body = new Uint8Array(W * H).fill(255);
  const trim = blank();
  const region = blank();
  for (let x = 10; x < 20; x++) region[5 * W + x] = 255;
  const changed = assignRegion({ body, trim }, "trim", region);
  expect(changed.sort()).toEqual(["body", "trim"]);
  expect(trim[5 * W + 15]).toBe(255);
  expect(body[5 * W + 15]).toBe(0);
  expect(body[6 * W + 15]).toBe(255);
  expect(subtractRegion(trim, region)).toBe(true);
  expect(area(trim)).toBe(0);
});

test("the outline is the part's edge only", () => {
  const m = blank();
  for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) m[y * W + x] = 255;
  const o = outline(m, W, H);
  expect(o[10 * W + 15]).toBe(255);
  expect(o[15 * W + 15]).toBe(0);
  expect(area(o)).toBe(36);
});

test("the overlay colors only the masked pixels", () => {
  const m = blank();
  m[3] = 255;
  const px = overlayPixels(m, [255, 0, 0], 0.5);
  expect([px[12], px[13], px[14], px[15]]).toEqual([255, 0, 0, 128]);
  expect(px[3]).toBe(0);
});
