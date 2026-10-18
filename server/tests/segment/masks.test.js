// SPDX-License-Identifier: MIT
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { dedupeInstances, maskArea, maskIoU, maskToPng, nmsStep, pngToMask, subtractMask, unionMasks } from "../../src/segment/masks.js";

const W = 6;
const H = 4;
const rect = (x0, y0, x1, y1, w = W, h = H) => {
  const m = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 255;
  return m;
};

describe("PNG round trip", () => {
  it("maskToPng → pngToMask gives the same bytes and size", async () => {
    const m = rect(1, 1, 4, 3);
    const png = await maskToPng(m, W, H);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height, meta.channels]).toEqual([W, H, 1]);
    const back = await pngToMask(png);
    expect(back.width).toBe(W);
    expect(back.height).toBe(H);
    expect(Buffer.compare(Buffer.from(back.mask), Buffer.from(m))).toBe(0);
  });

  it("pngToMask thresholds grey and RGB PNGs to 0/255", async () => {
    const rgb = Buffer.from([0, 0, 0, 200, 200, 200, 127, 127, 127, 128, 0, 0]);
    const png = await sharp(rgb, { raw: { width: 4, height: 1, channels: 3 } }).png().toBuffer();
    expect([...(await pngToMask(png)).mask]).toEqual([0, 255, 0, 255]);
  });

  it("maskToPng refuses a size that doesn't match", async () => {
    await expect(maskToPng(new Uint8Array(5), W, H)).rejects.toThrow(RangeError);
  });
});

describe("set operations", () => {
  it("union, subtract, area", () => {
    const a = rect(0, 0, 3, 4);
    const b = rect(2, 0, 6, 2);
    const u = unionMasks([a, null, b], W * H);
    expect(maskArea(u)).toBe(12 + 8 - 2);
    expect(unionMasks([null, undefined])).toBeNull();
    const s = subtractMask(a, b);
    expect(maskArea(s)).toBe(12 - 2);
    expect(s[0 * W + 2]).toBe(0);
    expect(s[3 * W + 2]).toBe(255);
    expect(maskArea(subtractMask(a, null))).toBe(12);
  });

  it("maskIoU exact and sampled", () => {
    const a = rect(0, 0, 4, 4);
    const b = rect(2, 0, 6, 4);
    expect(maskIoU(a, b, W, H)).toBeCloseTo(8 / 24, 12);
    expect(maskIoU(a, a, W, H, 2)).toBe(1);
    expect(nmsStep(2765, 2074)).toBe(10);
    expect(nmsStep(200, 100)).toBe(1);
  });

  it("dedupeInstances keeps the best of near-copies found by different prompts", () => {
    const a = { score: 0.8, mask: rect(0, 0, 4, 4), prompt: "siding" };
    const b = { score: 0.9, mask: rect(0, 0, 4, 3), prompt: "exterior wall" }; // IoU 0.75
    const c = { score: 0.6, mask: rect(4, 0, 6, 4), prompt: "siding" };
    const kept = dedupeInstances([a, b, c], W, H, 0.7);
    expect(kept.map((k) => k.prompt)).toEqual(["exterior wall", "siding"]);
    expect(kept[1]).toBe(c);
  });
});

describe("dilateMask and intersectMask", () => {
  it("grows a mask by r pixels each way (a square), clipped to the image", async () => {
    const { dilateMask, intersectMask } = await import("../../src/segment/masks.js");
    const w = 7;
    const h = 5;
    const m = new Uint8Array(w * h);
    m[2 * w + 3] = 255; // one pixel in the middle
    const d = dilateMask(m, w, h, 1);
    const set = [];
    for (let i = 0; i < d.length; i++) if (d[i]) set.push([i % w, Math.floor(i / w)]);
    expect(set).toEqual([[2, 1], [3, 1], [4, 1], [2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [4, 3]]);
    const edge = new Uint8Array(w * h);
    edge[0] = 255;
    expect([...dilateMask(edge, w, h, 2)].filter(Boolean).length).toBe(9); // a 3×3 corner
    expect([...dilateMask(m, w, h, 0)]).toEqual([...m]);
    expect([...intersectMask(d, edge)].filter(Boolean).length).toBe(0);
    expect([...intersectMask(d, m)].filter(Boolean).length).toBe(1);
  });
});
