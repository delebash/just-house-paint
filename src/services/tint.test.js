// SPDX-License-Identifier: MIT
// The ratio tint (src/services/tint.js): a normally lit wall shows the paint chip exactly,
// shadows keep their depth, the mask's soft edge blends, nothing outside changes, and the
// texture setting calms an old finish's grain; a dark finish painted light loses its blotches and
// keeps its boards' lines.
import { expect, test } from "vitest";
import {
  calmFinish,
  calmStrength,
  chipDeltaE,
  luminance,
  maskedBlur,
  paintLinear,
  partLight,
  percentile,
  preparePart,
  tintPhoto,
  toLinear8,
  toSrgb,
} from "./tint.js";

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

/** Weatherboard: boards `board` px tall whose last two rows are the lap's shadow (a third of the
 *  light), blotched along each board (±35% in ln Y, a different pattern per board, blotches about
 *  as long as the calming reaches — a 25th of the short side), at linear level `level`. Returns
 *  { photo, isLap(y) }. */
function weatherboard(w, h, level, board = 10) {
  const isLap = (y) => y % board >= board - 2;
  const photo = photoOf(w, h, (x, y) => {
    const k = Math.floor(y / board);
    const blotch = Math.exp(0.35 * Math.sin(x / 4 + k * 1.7) * Math.cos(x / 9 + k));
    const v = Math.round(255 * toSrgb(level * blotch * (isLap(y) ? 1 / 3 : 1)));
    return [v, v, v];
  });
  return { photo, isLap };
}
const lstarOf = (y) => (y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y);
/** The L* a paint of luminance `paintY` shows at each lighting ratio, split into the boards' faces
 *  and their lap rows: { faceSpread (p90 − p10 on the faces), lapDepth (faces' median − laps' median) }. */
function boardsLook(ratioAt, w, h, isLap, paintY) {
  const faces = [];
  const laps = [];
  for (let y = 4; y < h - 4; y++)
    for (let x = 20; x < w - 20; x++) (isLap(y) ? laps : faces).push(lstarOf(Math.min(1, paintY * ratioAt(y * w + x))));
  return { faceSpread: percentile(faces, 90) - percentile(faces, 10), lapDepth: percentile(faces, 50) - percentile(laps, 50) };
}

test("a dark board wall painted light loses its blotches and keeps the lines between its boards", () => {
  const w = 600;
  const h = 400;
  const { photo, isLap } = weatherboard(w, h, 0.035); // dark stain, L* ~22
  const Y = luminance(photo);
  const part = preparePart({ Y, mask: maskOf(w, h, () => 255), width: w, height: h });
  const WHITE = "#f2f0ea";
  expect(calmStrength(part, WHITE)).toBe(1);
  const paintY = luminance(photoOf(1, 1, () => [0xf2, 0xf0, 0xea]))[0];
  const before = boardsLook((i) => Y[i] / part.base, w, h, isLap, paintY);
  const after = boardsLook(partLight(part, WHITE), w, h, isLap, paintY);
  // measured: the faces' spread 16.9 → 7.2 L*, the laps' depth 33.7 → 31.6
  expect(after.faceSpread).toBeLessThan(before.faceSpread * 0.5);
  expect(after.lapDepth).toBeGreaterThan(before.lapDepth * 0.85);
  // the chip still shows on the normally lit pixels
  const out = tintPhoto({ photo, assignments: [{ part, hex: WHITE }] });
  expect(chipDeltaE({ tinted: out, part, hex: WHITE })).toBeLessThan(1);
});

test("a light finish, or a paint not much lighter than the finish, is painted as photographed", () => {
  const w = 120;
  const h = 80;
  const light = weatherboard(w, h, 0.45); // a light painted wall, L* ~73
  const lightPart = preparePart({ Y: luminance(light.photo), mask: maskOf(w, h, () => 255), width: w, height: h });
  expect(calmStrength(lightPart, "#ffffff")).toBe(0);
  const dark = weatherboard(w, h, 0.035);
  const Y = luminance(dark.photo);
  const darkPart = preparePart({ Y, mask: maskOf(w, h, () => 255), width: w, height: h });
  expect(calmStrength(darkPart, "#1f2a44")).toBe(0); // navy on dark stain
  const plain = partLight(darkPart, "#1f2a44");
  for (const i of [0, 333, 4321, w * h - 1]) expect(plain(i)).toBeCloseTo(Y[i] / darkPart.base, 6);
});

test("a dark finish with no direction (stucco, brick) keeps its detail", () => {
  const w = 120;
  const h = 80;
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const photo = photoOf(w, h, () => {
    const v = 35 + Math.round(rnd() * 40);
    return [v, v, v];
  });
  const Y = luminance(photo);
  const mask = maskOf(w, h, () => 255);
  const calm = calmFinish({ Y, mask, width: w, height: h });
  const spread = (a) => {
    const ln = Array.from(a, (v) => Math.log(v));
    return percentile(ln, 90) - percentile(ln, 10);
  };
  expect(spread(calm)).toBeGreaterThan(spread(Y) * 0.8);
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
