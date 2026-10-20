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
  photoExposure,
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

test("a texture change keeps the calmed lighting; the soft edge is calmed too", () => {
  const w = 600;
  const h = 400;
  const { photo } = weatherboard(w, h, 0.035);
  const Y = luminance(photo);
  // the core, and a soft ring two pixels wide around it
  const mask = maskOf(w, h, (x, y) => (x >= 22 && x < w - 22 && y >= 22 && y < h - 22 ? 255 : x >= 20 && x < w - 20 && y >= 20 && y < h - 20 ? 100 : 0));
  const first = preparePart({ Y, mask, width: w, height: h });
  partLight(first, "#f2f0ea");
  expect(first.calmY).toBeInstanceOf(Float32Array);
  const again = preparePart({ Y, mask, width: w, height: h, texture: 0.5, calmY: first.calmY });
  partLight(again, "#f2f0ea");
  expect(again.calm.Y).toBe(first.calmY); // not worked out again
  // the ring's lighting is calmed too (measured: its p99 1.26 → 1.14; the core's 1.30 → 1.08)
  const ratio = partLight(first, "#f2f0ea");
  const ring = [];
  const raw = [];
  for (let y = 20; y < h - 20; y++)
    for (let x = 20; x < w - 20; x++) {
      if (mask[y * w + x] === 255) continue;
      ring.push(ratio(y * w + x));
      raw.push(Y[y * w + x] / first.base);
    }
  expect(percentile(ring, 99)).toBeLessThan(percentile(raw, 99) * 0.95);
});

test("a light wall photographed dark isn't a dark finish: darkness is judged against the photo's bright end", () => {
  const w = 120;
  const h = 80;
  const dim = weatherboard(w, h, 0.035); // the stain's level — but nothing in the photo is brighter
  const Y = luminance(dim.photo);
  const part = preparePart({ Y, mask: maskOf(w, h, () => 255), width: w, height: h, exposure: photoExposure(Y) });
  expect(calmStrength(part, "#f2f0ea")).toBe(0);
  // the same wall under a bright sky (the photo's bright end far above it): a dark finish
  expect(calmStrength({ ...part, exposure: 0.8 }, "#f2f0ea")).toBe(1);
});

test("a part whose paint now is known: its darkness is that paint's, whatever the photo's light", () => {
  const w = 120;
  const h = 80;
  const Y = luminance(weatherboard(w, h, 0.035).photo);
  const part = preparePart({ Y, mask: maskOf(w, h, () => 255), width: w, height: h, exposure: photoExposure(Y) });
  // a dim photo with nothing bright: read from the photo the finish is light — told it's a dark stain, it is dark
  expect(calmStrength(part, "#f2f0ea")).toBe(0);
  expect(calmStrength(part, "#f2f0ea", "#4a3426")).toBe(1);
  // the paints compared as paints, not as the dim photo shows the new one: a mid grey is still 40+ L* lighter
  expect(calmStrength(part, "#a0a0a0", "#4a3426")).toBe(1);
  // backlit (a bright sky far above the walls): read from the photo, dark — told it's white, never calmed
  const backlit = { ...part, exposure: 0.8 };
  expect(calmStrength(backlit, "#f2f0ea")).toBe(1);
  expect(calmStrength(backlit, "#f2f0ea", "#f4f4f2")).toBe(0);
});

test("the photo's bright end passes over a few lamps or lit windows, and is the sky when there is one", () => {
  const Y = new Float32Array(10_000).fill(0.3);
  for (let i = 0; i < 300; i++) Y[i * 33] = 1; // 3 % of the photo: lamps, lit windows
  expect(photoExposure(Y)).toBeCloseTo(0.3, 5); // the 99th percentile was 1: a dim photo's houses read dark
  for (let i = 0; i < 1000; i++) Y[i] = 0.9; // a tenth of it bright sky
  expect(photoExposure(Y)).toBeCloseTo(0.9, 5);
});

test("a display-size dark wall (the calming's coarser grid) loses its blotches and keeps its board lines", () => {
  // 1600 × 1200: the structure and the light worked out on a grid 3× coarser, as at 2048 × 1536
  const w = 1600;
  const h = 1200;
  const board = 30;
  const isLap = (y) => y % board >= board - 4;
  const photo = photoOf(w, h, (x, y) => {
    const k = Math.floor(y / board);
    const blotch = Math.exp(0.35 * Math.sin(x / 11 + k * 1.7) * Math.cos(x / 27 + k));
    const v = Math.round(255 * toSrgb(0.035 * blotch * (isLap(y) ? 1 / 3 : 1)));
    return [v, v, v];
  });
  const Y = luminance(photo);
  const part = preparePart({ Y, mask: maskOf(w, h, () => 255), width: w, height: h });
  const paintY = luminance(photoOf(1, 1, () => [0xf2, 0xf0, 0xea]))[0];
  const before = boardsLook((i) => Y[i] / part.base, w, h, isLap, paintY);
  const after = boardsLook(partLight(part, "#f2f0ea"), w, h, isLap, paintY);
  expect(after.faceSpread).toBeLessThan(before.faceSpread * 0.5);
  expect(after.lapDepth).toBeGreaterThan(before.lapDepth * 0.85);
}, 20000);

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

test("a part is prepared in the box around it: the same light as the whole photo's blur, in a box-sized array", () => {
  // until 2026-10-20 each part's Texture blur and its level were worked out over the whole photo (2.2 s a
  // Texture step for 15 parts at 2048 px, ~280 MB): this is that code, and the box must give its numbers exactly
  const w = 240;
  const h = 160;
  let seed = 5;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // a dark grainy finish (so a light paint calms it) with lighting that changes everywhere
  const photo = photoOf(w, h, (x, y) => {
    const v = Math.round(20 + 40 * rnd() + 20 * Math.sin(x / 7) * Math.cos(y / 5));
    return [v, v, v + 6];
  });
  const Y = luminance(photo);
  const texture = 0.35;
  const masks = {
    inside: maskOf(w, h, (x, y) => (x >= 60 && x < 150 && y >= 40 && y < 110 ? 255 : 0)),
    // touching the photo's top and left edges
    corner: maskOf(w, h, (x, y) => (x < 30 && y < 25 ? 255 : 0)),
    // a soft edge, near the right and bottom edges
    soft: maskOf(w, h, (x, y) => {
      const d = Math.hypot(x - 215, y - 140);
      return d < 18 ? 255 : d < 23 ? 90 : 0;
    }),
    // two pieces far apart, with a hole
    apart: maskOf(w, h, (x, y) => ((x >= 10 && x < 40 && y >= 120 && y < 150) || (x >= 170 && x < 230 && y >= 10 && y < 60 && !(x >= 190 && x < 200 && y >= 30 && y < 40)) ? 255 : 0)),
  };
  const level = (values, mask) => {
    const inside = [];
    for (let i = 0; i < mask.length; i++) if (mask[i] >= 128) inside.push(values[i]);
    return Math.max(1e-4, percentile(inside, 75));
  };
  /** partLight as the whole photo's blur gave it. */
  const wholePhotoLight = (part, mask, hex) => {
    const base = level(Y, mask);
    const blurred = maskedBlur(Y, mask, w, h, part.radius);
    const s = calmStrength(part, hex);
    if (s <= 0) return (i) => (texture * Y[i] + (1 - texture) * blurred[i]) / base;
    const cY = calmFinish({ Y, mask, width: w, height: h });
    const cBlurred = maskedBlur(cY, mask, w, h, part.radius);
    const lvl = base ** (1 - s) * level(cY, mask) ** s;
    const lit = s >= 1 ? (i) => cY[i] : (i) => Y[i] ** (1 - s) * cY[i] ** s;
    return (i) => (texture * lit(i) + (1 - texture) * ((1 - s) * blurred[i] + s * cBlurred[i])) / lvl;
  };
  for (const [name, mask] of Object.entries(masks)) {
    const part = preparePart({ Y, mask, width: w, height: h, texture });
    expect(part.base, name).toBe(level(Y, mask));
    expect(part.blurred.length, name).toBe(part.box.w * part.box.h);
    expect(part.blurred.length, name).toBeLessThan(w * h);
    // a paint that calms the old finish fully, one that calms it partly, one that keeps it as photographed
    for (const hex of ["#f2f0ea", "#8a8a8a", "#2a2a2a"]) {
      const now = partLight(part, hex);
      const before = wholePhotoLight(part, mask, hex);
      let differ = 0;
      for (let i = 0; i < mask.length; i++) if (mask[i] && now(i) !== before(i)) differ++;
      expect(differ, `${name} ${hex}`).toBe(0);
    }
  }
  expect(calmStrength(preparePart({ Y, mask: masks.inside, width: w, height: h }), "#f2f0ea")).toBe(1);
  const partly = calmStrength(preparePart({ Y, mask: masks.inside, width: w, height: h }), "#8a8a8a");
  expect(partly).toBeGreaterThan(0);
  expect(partly).toBeLessThan(1);
  // an empty outline (a part added by hand, not drawn yet): nothing to paint
  const empty = preparePart({ Y, mask: new Uint8Array(w * h), width: w, height: h, texture });
  expect(empty).toMatchObject({ pixels: 0, box: null, blurred: null });
});
