// SPDX-License-Identifier: MIT
// The paste-back and color-lock math on tiny synthetic images.
import { differenceCiede2000, parse } from "culori";
import { describe, expect, test } from "vitest";
import {
  colorLock,
  DEFAULT_COMPOSE,
  deltaEAt,
  featherMask,
  luminanceOf,
  medianColor,
  pasteBack,
  percentile,
  surfaceStats,
  toLinear,
  toSrgb,
  workingSize,
} from "../../src/aiphoto/pixels.js";

const de = differenceCiede2000();
/** A w×h RGB buffer filled by fn(x, y) → [r, g, b]. */
function image(w, h, fn) {
  const b = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      b.set(c, (y * w + x) * 3);
    }
  return b;
}
const px = (buf, i) => [buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]];

describe("workingSize", () => {
  test("the probe's photo lands on the measured 1024×768", () => {
    expect(workingSize(2765, 2074)).toEqual({ width: 1024, height: 768 });
  });
  test("multiples of 16, ~the pixel budget, aspect kept", () => {
    for (const [w, h] of [
      [4032, 3024],
      [3024, 4032],
      [6000, 4000],
      [1920, 1080],
      [5000, 1000],
    ]) {
      const s = workingSize(w, h);
      expect(s.width % 16).toBe(0);
      expect(s.height % 16).toBe(0);
      expect(Math.abs(s.width * s.height - 786432) / 786432).toBeLessThan(0.05);
      expect(Math.abs(s.width / s.height - w / h) / (w / h)).toBeLessThan(0.03);
    }
    expect(workingSize(4032, 3024, { targetPixels: 1024 * 1024, multipleOf: 16 })).toEqual({ width: 1184, height: 880 });
  });
  test("a small photo is never upscaled", () => {
    expect(workingSize(640, 480)).toEqual({ width: 640, height: 480 });
  });
});

describe("pasteBack", () => {
  test("alpha 0 keeps the photo byte for byte, 1 takes the render, 0.5 mixes", () => {
    const photo = image(3, 1, () => [10, 200, 30]);
    const render = image(3, 1, () => [250, 0, 130]);
    const out = pasteBack(photo, render, Float32Array.from([0, 1, 0.5]));
    expect(px(out, 0)).toEqual([10, 200, 30]);
    expect(px(out, 1)).toEqual([250, 0, 130]);
    expect(px(out, 2)).toEqual([130, 100, 80]);
    expect(px(photo, 1)).toEqual([10, 200, 30]); // inputs untouched
  });
});

describe("colorLock", () => {
  // A wall in the render: left half normally lit (grey 180), right half in shade (grey 90).
  const W = 8;
  const H = 4;
  const render = image(W, H, (x) => (x < W / 2 ? [180, 175, 170] : [90, 88, 85]));
  const photo = image(W, H, () => [255, 255, 255]);
  const mask = new Float32Array(W * H).fill(1);
  const Y = luminanceOf(render);

  test("the normally lit pixels come out as the paint exactly; shade keeps its ratio", () => {
    const stats = surfaceStats(Y, mask, DEFAULT_COMPOSE);
    expect(stats.inside).toHaveLength(W * H);
    expect(stats.base).toBeCloseTo(Y[0], 6); // the 75th percentile is the lit level
    const out = colorLock(photo, render, mask, "#ad2c34", stats, Y);
    expect(px(out, 0)).toEqual([0xad, 0x2c, 0x34]);
    const { deltaE, median } = deltaEAt(out, stats.lit, "#ad2c34");
    expect(median).toBe("#ad2c34");
    expect(deltaE).toBeLessThan(0.01);
    // shade: paint × (Y_shade / Y_lit), in linear light
    const ratio = Y[W - 1] / Y[0];
    const want = [0xad, 0x2c, 0x34].map((v) => Math.round(255 * toSrgb(toLinear(v / 255) * ratio)));
    expect(px(out, W - 1)).toEqual(want);
  });

  test("bright highlights clip at white instead of overflowing", () => {
    const hot = image(4, 1, (x) => (x === 3 ? [255, 255, 255] : [60, 60, 60]));
    const Yh = luminanceOf(hot);
    const m = new Float32Array(4).fill(1);
    const stats = surfaceStats(Yh, m, DEFAULT_COMPOSE);
    const out = colorLock(Buffer.alloc(12), hot, m, "#edeae0", stats, Yh);
    expect(px(out, 3)).toEqual([255, 255, 255]);
  });

  test("outside the mask the photo is untouched; a soft edge blends", () => {
    const m = Float32Array.from({ length: W * H }, (_, i) => (i % W === 0 ? 0 : i % W === 1 ? 0.5 : 1));
    const stats = surfaceStats(Y, m, DEFAULT_COMPOSE);
    const out = colorLock(photo, render, m, "#2f3d4c", stats, Y);
    expect(px(out, 0)).toEqual([255, 255, 255]);
    const edge = px(out, 1);
    const full = px(out, 2);
    for (let k = 0; k < 3; k++) expect(Math.abs(edge[k] - (full[k] + 255) / 2)).toBeLessThanOrEqual(1);
  });

  test("a malformed paint is refused", () => {
    expect(() => colorLock(photo, render, mask, "red", { base: 1 }, Y)).toThrow(/#rrggbb/);
  });
});

describe("statistics", () => {
  test("percentile is the nearest rank, as the probe picked it", () => {
    expect(percentile([5, 1, 4, 2, 3], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4], 75)).toBe(3);
    expect(Number.isNaN(percentile([], 50))).toBe(true);
  });

  test("medianColor equals the sorted per-channel median", () => {
    const buf = image(5, 1, (x) => [9 + x * 10, 50 - x * 3, x % 2 ? 0 : 255]);
    const m = medianColor(buf, [0, 1, 2, 3, 4]);
    const sorted = (k) => [0, 1, 2, 3, 4].map((i) => buf[i * 3 + k]).sort((a, b) => a - b)[2] / 255;
    expect([m.r, m.g, m.b]).toEqual([sorted(0), sorted(1), sorted(2)]);
    expect(medianColor(buf, [])).toBeNull();
  });

  test("ΔE2000 matches culori directly", () => {
    const buf = image(1, 1, () => [0x88, 0x48, 0x42]);
    const { deltaE } = deltaEAt(buf, [0], "#ad2c34");
    expect(deltaE).toBeCloseTo(de(parse("#ad2c34"), parse("#884842")), 9);
  });
});

describe("featherMask", () => {
  test("a hard edge becomes a soft ramp; far pixels stay 0 and 1", async () => {
    const W = 40;
    const m = Float32Array.from({ length: W * 4 }, (_, i) => (i % W >= 20 ? 1 : 0));
    const f = await featherMask(m, W, 4, 2);
    const row = Array.from(f.slice(0, W));
    expect(row[0]).toBe(0);
    expect(row[W - 1]).toBe(1);
    expect(row[19]).toBeGreaterThan(0.2);
    expect(row[19]).toBeLessThan(0.6);
    expect(row[20]).toBeGreaterThan(0.4);
    expect(row[20]).toBeLessThan(0.8);
    for (let x = 1; x < W; x++) expect(row[x]).toBeGreaterThanOrEqual(row[x - 1]);
    expect(await featherMask(m, W, 4, 0)).toBe(m);
  });
});

describe("repaintedAlpha", () => {
  test("0 where the render kept the photo, the alpha where the AI repainted, a ramp between", async () => {
    const { repaintedAlpha } = await import("../../src/aiphoto/pixels.js");
    const photo = Buffer.from([200, 200, 200, 200, 200, 200, 200, 200, 200]);
    const render = Buffer.from([202, 199, 201, 175, 200, 200, 120, 40, 50]);
    const out = repaintedAlpha(photo, render, Float32Array.from([1, 1, 0.5]), [0.08, 0.16]);
    expect(out[0]).toBe(0); // kept: distance ~2.4 on a bright pixel
    expect(out[1]).toBeGreaterThan(0.2); // distance 25 at brightness ~196 — partway up the ramp
    expect(out[1]).toBeLessThan(0.8);
    expect(out[2]).toBe(0.5); // repainted, at its own alpha
    // the same small distance counts as repainted on a dark pixel
    const dark = repaintedAlpha(Buffer.from([40, 30, 28]), Buffer.from([19, 10, 9]), Float32Array.from([1]), [0.08, 0.16]);
    expect(dark[0]).toBe(1);
  });
});
