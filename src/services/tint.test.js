// SPDX-License-Identifier: MIT
// The ratio tint (src/services/tint.js): a normally lit wall shows the paint chip exactly,
// shadows keep their depth, the mask's soft edge blends, nothing outside changes, and the
// texture setting calms an old finish's grain.
import { expect, test } from "vitest";
import { chipDeltaE, luminance, maskedBlur, paintLinear, percentile, preparePart, tintPhoto, toLinear8 } from "./tint.js";

/** A w×h RGBA photo filled by fn(x, y) → [r, g, b]. */
function photoOf(w, h, fn) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      const p = (y * w + x) * 4;
      a[p] = r;
      a[p + 1] = g;
      a[p + 2] = b;
      a[p + 3] = 255;
    }
  return a;
}
const maskOf = (w, h, fn) => {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = fn(x, y);
  return m;
};

const RED = "#ad2c34"; // SW "Positive Red", the probe's test paint

test("an evenly lit wall shows the paint chip exactly", () => {
  const w = 40;
  const h = 30;
  const photo = photoOf(w, h, () => [200, 200, 200]);
  const Y = luminance(photo);
  const part = preparePart({ Y, mask: maskOf(w, h, () => 255), width: w, height: h });
  const out = tintPhoto({ photo, Y, assignments: [{ part, hex: RED }] });
  expect([out[0], out[1], out[2]]).toEqual([0xad, 0x2c, 0x34]);
  expect(chipDeltaE({ tinted: out, Y, part, hex: RED })).toBeLessThan(0.5);
});

test("a shadow keeps its depth, in linear light", () => {
  const w = 40;
  const h = 40;
  // the top half lit (200), the bottom half in shadow (half the light)
  const lit = 200;
  const shade = Math.round(255 * ((toLinear8(lit) / 2) ** (1 / 2.4) * 1.055 - 0.055));
  const photo = photoOf(w, h, (_x, y) => (y < 20 ? [lit, lit, lit] : [shade, shade, shade]));
  const Y = luminance(photo);
  const part = preparePart({ Y, mask: maskOf(w, h, () => 255), width: w, height: h });
  const out = tintPhoto({ photo, Y, assignments: [{ part, hex: RED }] });
  const yLit = luminance(out.slice(0, 4))[0];
  const p = (30 * w + 5) * 4;
  const yShade = luminance(out.slice(p, p + 4))[0];
  expect(yShade / yLit).toBeGreaterThan(0.45);
  expect(yShade / yLit).toBeLessThan(0.55);
});

test("outside the mask nothing changes; the soft edge blends", () => {
  const w = 10;
  const h = 1;
  const photo = photoOf(w, h, () => [50, 100, 150]);
  const Y = luminance(photo);
  const mask = maskOf(w, h, (x) => (x < 3 ? 255 : x === 3 ? 128 : 0));
  const part = preparePart({ Y, mask, width: w, height: h });
  const out = tintPhoto({ photo, Y, assignments: [{ part, hex: "#ffffff" }] });
  expect([out[9 * 4], out[9 * 4 + 1], out[9 * 4 + 2]]).toEqual([50, 100, 150]);
  const edge = [out[12], out[13], out[14]];
  expect(edge[0]).toBeGreaterThan(50);
  expect(edge[0]).toBeLessThan(out[0]);
  expect(photo[0]).toBe(50); // the photo itself is untouched
});

test("a later part paints over an earlier one; a part with no color is skipped", () => {
  const w = 4;
  const h = 1;
  const photo = photoOf(w, h, () => [180, 180, 180]);
  const Y = luminance(photo);
  const all = preparePart({ Y, mask: maskOf(w, h, () => 255), width: w, height: h });
  const right = preparePart({ Y, mask: maskOf(w, h, (x) => (x >= 2 ? 255 : 0)), width: w, height: h });
  const out = tintPhoto({ photo, Y, assignments: [{ part: all, hex: "#ffffff" }, { part: right, hex: "#000000" }, { part: all, hex: null }] });
  expect(out[0]).toBe(255);
  expect(out[12]).toBe(0);
});

test("lowering the texture calms a grainy finish", () => {
  const w = 120;
  const h = 80;
  // a dark stained wall with strong grain (the dark-to-light case)
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const photo = photoOf(w, h, () => {
    const v = 40 + Math.round(rnd() * 40);
    return [v, v, v + 10];
  });
  const Y = luminance(photo);
  const mask = maskOf(w, h, () => 255);
  const spread = (tex) => {
    const part = preparePart({ Y, mask, width: w, height: h, texture: tex });
    const out = tintPhoto({ photo, Y, assignments: [{ part, hex: "#edeae0" }] });
    const ys = Array.from(luminance(out));
    return percentile(ys, 90) - percentile(ys, 10);
  };
  expect(spread(0.2)).toBeLessThan(spread(1) * 0.5);
});

test("the masked blur never reads outside the mask", () => {
  const w = 20;
  const h = 1;
  const values = Float32Array.from({ length: w }, (_, x) => (x < 10 ? 1 : 100));
  const mask = maskOf(w, h, (x) => (x < 10 ? 255 : 0));
  const out = maskedBlur(values, mask, w, h, 4);
  for (let x = 0; x < 10; x++) expect(out[x]).toBeCloseTo(1, 5);
});

test("a bad color is refused; percentiles are nearest-rank", () => {
  expect(() => paintLinear("not-a-color")).toThrow(/not a color/);
  expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  expect(percentile([], 50)).toBe(0);
});

test("a display-size photo tints fast", () => {
  const w = 2048;
  const h = 1536;
  const photo = photoOf(w, h, (x, y) => [(x * 7) % 256, (y * 5) % 256, 128]);
  const Y = luminance(photo);
  const part = preparePart({ Y, mask: maskOf(w, h, (x) => (x < 1500 ? 255 : 0)), width: w, height: h });
  const t0 = performance.now();
  tintPhoto({ photo, Y, assignments: [{ part, hex: RED }] });
  expect(performance.now() - t0).toBeLessThan(400);
});
