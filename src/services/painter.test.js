// SPDX-License-Identifier: MIT
// The house page's painter: parts prepared once, repainted per color click, ΔE per part, the part
// under a pixel, and a brush change re-prepared.
import { expect, test } from "vitest";
import { createPainter } from "./painter.js";

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
