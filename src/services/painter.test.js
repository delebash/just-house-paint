// SPDX-License-Identifier: MIT
// The house page's painter: parts prepared once, repainted per color click, ΔE per part, the part
// under a pixel, and a brush change re-prepared.
import { expect, test, vi } from "vitest";

// what the painter hands tint.js each time it prepares a part (the calmed lighting it carries)
const prepares = vi.hoisted(() => []);
vi.mock("./tint.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    preparePart(args) {
      prepares.push({ calmY: args.calmY ?? null });
      return real.preparePart(args);
    },
  };
});

const { createPainter } = await import("./painter.js");

const W = 8;
const H = 4;
const rgba = new Uint8ClampedArray(W * H * 4).fill(200);
const maskOf = (fn) => Uint8Array.from({ length: W * H }, (_, i) => (fn(i % W, Math.floor(i / W)) ? 255 : 0));

test("paints each part in its color, later parts on top, with ΔE to the chip", () => {
  const p = createPainter({ rgba, width: W, height: H });
  p.setMask("body", maskOf(() => true));
  p.setMask("door", maskOf((x) => x >= 6));
  const { rgba: out, deltaE } = p.paint({ body: "#ad2c34", door: "#000000" }, ["body", "door"]);
  expect([out[0], out[1], out[2]]).toEqual([0xad, 0x2c, 0x34]);
  expect([out[7 * 4], out[7 * 4 + 1], out[7 * 4 + 2]]).toEqual([0, 0, 0]);
  expect(deltaE.body).toBeLessThan(0.5);
  expect(Object.keys(deltaE)).toEqual(["body", "door"]);
  // a part with no color isn't painted
  expect(p.paint({ body: null }, ["body"]).rgba[0]).toBe(200);
});

test("the part under a pixel is the one painted on top", () => {
  const p = createPainter({ rgba, width: W, height: H });
  p.setMask("body", maskOf(() => true));
  p.setMask("door", maskOf((x) => x >= 6));
  expect(p.partAt(7, 1, ["body", "door"])).toBe("door");
  expect(p.partAt(1, 1, ["body", "door"])).toBe("body");
  expect(p.partAt(1, 1, ["door"])).toBeNull();
});

test("a brush change is prepared again", () => {
  const p = createPainter({ rgba, width: W, height: H });
  const m = maskOf((x) => x < 2);
  p.setMask("trim", m);
  expect(p.paint({ trim: "#ffffff" }).rgba[3 * 4]).toBe(200);
  for (let i = 0; i < m.length; i++) m[i] = 255; // the brush filled it
  p.touched("trim");
  expect(p.paint({ trim: "#ffffff" }).rgba[3 * 4]).toBe(255);
});

test("the eyedropper reads the photo's own color — a median, so a stray pixel doesn't decide it", () => {
  const w = 10;
  const h = 10;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba.set([200, 100, 50, 255], i * 4);
  rgba.set([0, 0, 0, 255], (5 * w + 5) * 4); // one dark pixel in the middle
  const painter = createPainter({ rgba, width: w, height: h });
  expect(painter.sample(5, 5, 1)).toBe("#c86432");
  expect(painter.sample(0, 0, 2)).toBe("#c86432"); // a corner: only the pixels inside the photo
});

test("a part's color as photographed is the median inside its outline", () => {
  const w = 4;
  const h = 2;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba.set(i < 4 ? [255, 255, 255, 255] : [10, 20, 30, 255], i * 4);
  const painter = createPainter({ rgba, width: w, height: h });
  painter.setMask("trim", Uint8Array.from([0, 0, 0, 0, 255, 255, 255, 0]));
  expect(painter.photographed("trim")).toBe("#0a141e");
  expect(painter.photographed("nothing")).toBeNull();
  painter.setMask("empty", new Uint8Array(w * h));
  expect(painter.photographed("empty")).toBeNull();
});

test("the Light brightens or dulls the whole picture alike, and ΔE stays measured at the photo's own light", () => {
  const p = createPainter({ rgba, width: W, height: H });
  p.setMask("body", maskOf((x) => x < 4));
  const base = p.paint({ body: "#64695c" }, ["body"]);
  const bright = p.paint({ body: "#64695c" }, ["body"], { light: 1.5 });
  // painted and unpainted pixels both brighter
  expect(bright.rgba[0]).toBeGreaterThan(base.rgba[0]);
  expect(bright.rgba[6 * 4]).toBeGreaterThan(base.rgba[6 * 4]);
  expect(bright.deltaE.body).toBeCloseTo(base.deltaE.body, 5);
  expect(p.paint({ body: "#64695c" }, ["body"], { light: 1 }).rgba).toEqual(base.rgba);
});

test("a part's tones: the paint in shade, on most of it and in light — the light one is the chip", () => {
  // a wall half in shade (100) and half lit (200)
  const lit = new Uint8ClampedArray(W * H * 4).fill(200);
  for (let i = 0; i < W * H; i++) if (i % W < 4) lit.fill(100, i * 4, i * 4 + 3);
  const p = createPainter({ rgba: lit, width: W, height: H });
  p.setMask("body", maskOf(() => true));
  const tones = p.tones("body", "#64695c");
  expect(tones.light).toBe("#64695c");
  const value = (hex) => Number.parseInt(hex.slice(1, 3), 16);
  expect(value(tones.shade)).toBeLessThan(value(tones.light));
  expect(value(tones.middle)).toBeLessThanOrEqual(value(tones.light));
  expect(p.tones("body", null)).toBeNull();
  // through the Light, every tone moves with it
  expect(value(p.tones("body", "#64695c", 1.5).light)).toBeGreaterThan(value(tones.light));
});

test("the paint a part has now sets its light: the photo's color there ÷ that paint, per channel, capped", () => {
  // a white wall photographed bluish-grey (overcast): 180/190/210
  const photo = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) photo.set([180, 190, 210, 255], i * 4);
  const p = createPainter({ rgba: photo, width: W, height: H });
  p.setMask("body", maskOf(() => true));
  // without a paint now, a lit pixel is the chip; with white known, the gain is photo ÷ white
  expect(p.gain("body", null)).toEqual([1, 1, 1]);
  const g = p.gain("body", "#ffffff");
  expect(g[0]).toBeCloseTo(0.456, 2); // (180/255) in linear light
  expect(g[2]).toBeGreaterThan(g[0]); // the blue cast kept
  // a new paint shows as the camera would have taken it: white now → the photo itself; its ΔE is
  // to the paint in that light, so the light itself doesn't count against it
  const { rgba: out, deltaE } = p.paint({ body: "#ffffff" }, ["body"], { current: { body: "#ffffff" } });
  expect([out[0], out[1], out[2]]).toEqual([180, 190, 210]);
  expect(deltaE.body).toBeLessThan(0.5);
  // the tones follow the same light
  expect(p.tones("body", "#ffffff", 1, "#ffffff").light).toBe("#b4bed2");
  // a wrong pick (black, for a light wall) is capped, not wild
  expect(p.gain("body", "#000000")).toEqual([1, 1, 1]); // no channel to divide by
  expect(p.gain("body", "#101010").every((v) => v === 4)).toBe(true);
});

test("a dark wall in a photo with nothing bright in it is calmed once its owner says the paint it has now", () => {
  // dark blotchy boards (tint.test.js's weatherboard), no sky: read from the photo alone the finish is
  // its own bright end — light, not calmed (600 px: the calming's reach grows with the photo, and at 300 a
  // blotch this long is out of it)
  const w = 600;
  const h = 400;
  const photo = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = Math.floor(y / 10);
      const blotch = Math.exp(0.35 * Math.sin(x / 4 + k * 1.7) * Math.cos(x / 9 + k));
      const v = Math.round(255 * (0.035 * blotch * (y % 10 >= 8 ? 1 / 3 : 1)) ** (1 / 2.2));
      photo.set([v, v, v, 255], (y * w + x) * 4);
    }
  const p = createPainter({ rgba: photo, width: w, height: h });
  p.setMask("body", new Uint8Array(w * h).fill(255));
  // the red channel's spread over the boards' faces (the lines between them left out), against its mean
  const spread = (out) => {
    const v = [];
    for (let y = 0; y < h; y++) if (y % 10 < 8) for (let x = 0; x < w; x++) v.push(out[(y * w + x) * 4]);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) / mean;
  };
  const fromPhoto = spread(p.paint({ body: "#a0a0a0" }).rgba);
  const known = spread(p.paint({ body: "#a0a0a0" }, ["body"], { current: { body: "#4a3426" } }).rgba); // a dark stain
  expect(known).toBeLessThan(fromPhoto * 0.6); // measured: 0.069 → 0.035 (unchanged before the paint now counted)
});

test("a dark wall's calmed lighting is kept through a Texture change and brush strokes, and worked out again once they pause", () => {
  // a dark board wall under a bright sky band: the body is a dark finish, painted white it is calmed
  const w = 200;
  const h = 120;
  const photo = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = y < 20 ? 235 : y % 10 >= 8 ? 15 : 50 + Math.round(20 * Math.sin(x / 5 + y));
      photo.set([v, v, v, 255], (y * w + x) * 4);
    }
  const body = Uint8Array.from({ length: w * h }, (_, i) => (Math.floor(i / w) >= 20 ? 255 : 0));
  const p = createPainter({ rgba: photo, width: w, height: h });
  p.setMask("body", body);
  prepares.length = 0;
  p.paint({ body: "#f2f0ea" });
  expect(prepares).toEqual([{ calmY: null }]); // the first time: nothing to carry, worked out
  p.setTexture(0.5);
  p.paint({ body: "#f2f0ea" });
  expect(prepares[1].calmY).toBeInstanceOf(Float32Array); // the texture changed: the calming carried over
  p.touched("body"); // a brush stroke changed the outline
  p.paint({ body: "#f2f0ea" });
  expect(prepares[2].calmY).toBeInstanceOf(Float32Array); // kept while the strokes go on (~0.6 s each otherwise)
  expect(p.calmAgain("body")).toBe(true); // the strokes paused
  p.paint({ body: "#f2f0ea" });
  expect(prepares[3].calmY).toBeNull(); // worked out again for the new outline
  expect(p.calmAgain("door")).toBe(false); // no such part: nothing to repaint
});
