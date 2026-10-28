// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { snapshotFilePath } from "@delebash/core/runner/models";
import { Tokenizer } from "@huggingface/tokenizers";
import { describe, expect, it } from "vitest";
import { SAM3 } from "../../src/seed_presets.js";
import {
  binaryIoU,
  boxToCxcywh,
  CONTEXT_LENGTH,
  clampBox,
  cxcywhToBox,
  geometryArrays,
  MAX_GEOMETRY,
  maskNms,
  nativeBinary,
  padTokens,
  pointToCxcywh,
  promptRelevance,
  scoreQueries,
  sigmoid,
  tokenize,
  upscaleMask,
} from "../../src/segment/postprocess.js";

// CLIP's tokenizer.json is one of the part finder's model files (seed_presets.js SAM3), in the kit's cache:
// HP_REAL_CACHE names the cache (as the real tests), HP_TOKENIZER_DIR another folder that has it. Without one the
// real-tokenizer checks skip.
const clip = SAM3.files.find((f) => f.slot === "tokenizer");
const TOKENIZER_DIR =
  process.env.HP_TOKENIZER_DIR ?? (process.env.HP_REAL_CACHE ? path.dirname(snapshotFilePath(process.env.HP_REAL_CACHE, clip.repo, clip.revision, clip.path)) : "");
const hasTokenizer = !!TOKENIZER_DIR && existsSync(path.join(TOKENIZER_DIR, "tokenizer.json"));

describe("tokens", () => {
  it("pads with 0 (not the end token) to 32", () => {
    const t = padTokens([49406, 8474, 2489, 49407]);
    expect(t).toBeInstanceOf(BigInt64Array);
    expect(t.length).toBe(CONTEXT_LENGTH);
    expect([...t.slice(0, 4)]).toEqual([49406n, 8474n, 2489n, 49407n]);
    expect([...t.slice(4)].every((v) => v === 0n)).toBe(true);
  });

  it("takes exactly 32 and refuses 33", () => {
    expect(padTokens(Array.from({ length: 32 }, (_, i) => i + 1))[31]).toBe(32n);
    expect(() => padTokens(Array.from({ length: 33 }, () => 1))).toThrow(/33 tokens/);
  });

  it("tokenize goes through the tokenizer and rejects empty phrases", () => {
    const fake = { encode: (s) => ({ ids: [49406, s.length, 49407] }) };
    expect([...tokenize(fake, "abc").slice(0, 4)]).toEqual([49406n, 3n, 49407n, 0n]);
    expect(() => tokenize(fake, "  ")).toThrow(TypeError);
    expect(() => tokenize(fake, 7)).toThrow(TypeError);
  });

  it.skipIf(!hasTokenizer)("CLIP tokenizer.json reproduces samexporter's test ids", () => {
    const tok = new Tokenizer(
      JSON.parse(readFileSync(path.join(TOKENIZER_DIR, "tokenizer.json"), "utf8")),
      JSON.parse(readFileSync(path.join(TOKENIZER_DIR, "tokenizer_config.json"), "utf8")),
    );
    // samexporter tests/test_clip_tokenizer.py
    expect([...tokenize(tok, "plant").slice(0, 4)]).toEqual([49406n, 3912n, 49407n, 0n]);
    expect([...tokenize(tok, "a person wearing a red hat").slice(0, 9)]).toEqual(
      [49406, 320, 2533, 3309, 320, 736, 3801, 49407, 0].map(BigInt),
    );
    // the probe's ids; CLIP lower-cases
    expect([...tokenize(tok, "Garage Door").slice(0, 5)]).toEqual([49406n, 8474n, 2489n, 49407n, 0n]);
  });
});

describe("boxes", () => {
  it("normalizes pixel boxes to cx,cy,w,h and back", () => {
    const c = boxToCxcywh([282, 1249, 943, 1536], 2765, 2074);
    expect(c[0]).toBeCloseTo((282 + 943) / 2 / 2765, 12);
    expect(c[3]).toBeCloseTo((1536 - 1249) / 2074, 12);
    const back = cxcywhToBox(c, 2765, 2074);
    [282, 1249, 943, 1536].forEach((v, i) => {
      expect(back[i]).toBeCloseTo(v, 9);
    });
  });

  it("denormalizes the decoder's boxes as the probe does", () => {
    expect(cxcywhToBox([0.5, 0.5, 0.2, 0.1], 1000, 500)).toEqual([400, 225, 600, 275]);
  });

  it("rejects empty or inverted boxes and clamps to the photo", () => {
    expect(() => boxToCxcywh([10, 10, 10, 20], 100, 100)).toThrow(RangeError);
    expect(() => boxToCxcywh([20, 10, 10, 20], 100, 100)).toThrow(RangeError);
    expect(clampBox([-5, 10, 120, 90], 100, 80)).toEqual([0, 10, 100, 80]);
  });

  it("turns a point into samexporter's 1% exemplar box", () => {
    expect(pointToCxcywh({ x: 50, y: 25 }, 100, 100)).toEqual([0.5, 0.25, 0.01, 0.01]);
  });

  it("pads the geometry slots: unused = true, label 1, coords 0", () => {
    const g = geometryArrays([
      { cxcywh: [0.1, 0.2, 0.3, 0.4], label: 1 },
      { cxcywh: [0.5, 0.5, 0.01, 0.01], label: 0 },
    ]);
    expect(g.coords.length).toBe(MAX_GEOMETRY * 4);
    expect([...g.coords.slice(0, 8)].map((v) => +v.toFixed(5))).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.5, 0.01, 0.01]);
    expect([...g.coords.slice(8)].every((v) => v === 0)).toBe(true);
    expect([...g.labels]).toEqual([1n, 0n, 1n, 1n, 1n, 1n, 1n, 1n]);
    expect([...g.unused]).toEqual([0, 0, 1, 1, 1, 1, 1, 1]);
    expect([...geometryArrays([]).unused].every((v) => v === 1)).toBe(true);
    expect(() => geometryArrays(Array.from({ length: 9 }, () => ({ cxcywh: [0, 0, 0, 0], label: 1 })))).toThrow(/at most 8/);
  });
});

describe("scores", () => {
  it("score = σ(logit)·σ(presence), strictly over the threshold, best first", () => {
    const logits = Float32Array.from([0, 5, -3, 2, Number.NaN]);
    const got = scoreQueries(logits, 4, 0.5);
    const p = sigmoid(4);
    expect(got.map((g) => g.q)).toEqual([1, 3]);
    expect(got[0].score).toBeCloseTo(sigmoid(5) * p, 12);
    // σ(0)·σ(4) = 0.49 → out at 0.5
    expect(scoreQueries(Float32Array.from([0]), 80, 0.5)).toEqual([]);
  });

  it("sigmoid is clipped and never NaN", () => {
    expect(sigmoid(1e9)).toBe(1);
    expect(sigmoid(-1e9)).toBeGreaterThan(0);
  });
});

// The 288→full upscale, written the slow, obvious way (the probe's loop over every pixel).
function naiveUpscale(logits, q, sw, sh, dw, dh) {
  const ax = (dst, src) =>
    Array.from({ length: dst }, (_, d) => {
      const s = Math.min(Math.max((d + 0.5) * (src / dst) - 0.5, 0), src - 1);
      const i0 = Math.floor(s);
      return { i0, i1: Math.min(i0 + 1, src - 1), f: Math.fround(s - i0) };
    });
  const X = ax(dw, sw);
  const Y = ax(dh, sh);
  const base = q * sw * sh;
  const out = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const v = (r, c) => logits[base + r * sw + c];
      const a = v(Y[y].i0, X[x].i0) * (1 - X[x].f) + v(Y[y].i0, X[x].i1) * X[x].f;
      const b = v(Y[y].i1, X[x].i0) * (1 - X[x].f) + v(Y[y].i1, X[x].i1) * X[x].f;
      out[y * dw + x] = a * (1 - Y[y].f) + b * Y[y].f > 0 ? 255 : 0;
    }
  }
  return out;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("288 → full-size mask upscale", () => {
  it("matches the full-image bilinear loop exactly (blobs, odd sizes, second query)", () => {
    const sw = 24;
    const sh = 18;
    const r = rng(7);
    const logits = new Float32Array(2 * sw * sh).fill(-4);
    // query 1: a blob plus noise
    for (let y = 5; y < 11; y++) for (let x = 8; x < 17; x++) logits[sw * sh + y * sw + x] = 3 + r();
    for (let i = 0; i < sw * sh; i++) logits[sw * sh + i] += (r() - 0.5) * 0.5;
    for (const [dw, dh] of [
      [97, 61],
      [24, 18],
      [13, 9],
      [301, 233],
    ]) {
      const fast = upscaleMask(logits, 1, sw, sh, dw, dh);
      const slow = naiveUpscale(logits, 1, sw, sh, dw, dh);
      expect(Buffer.compare(Buffer.from(fast.mask), Buffer.from(slow))).toBe(0);
      expect(fast.area).toBe(slow.filter(Boolean).length);
    }
  });

  it("random logits everywhere: still identical", () => {
    const r = rng(11);
    const logits = Float32Array.from({ length: 16 * 12 }, () => r() * 2 - 1.2);
    const fast = upscaleMask(logits, 0, 16, 12, 70, 50);
    expect(Buffer.compare(Buffer.from(fast.mask), Buffer.from(naiveUpscale(logits, 0, 16, 12, 70, 50)))).toBe(0);
  });

  it("an all-negative query is empty; the bbox is inclusive pixels", () => {
    const logits = new Float32Array(8 * 8).fill(-1);
    expect(upscaleMask(logits, 0, 8, 8, 32, 32)).toMatchObject({ area: 0, bbox: null });
    logits[3 * 8 + 4] = 10; // one hot cell
    const one = upscaleMask(logits, 0, 8, 8, 32, 32);
    expect(one.area).toBeGreaterThan(0);
    const [x0, y0, x1, y1] = one.bbox;
    expect(x0).toBeLessThanOrEqual(4 * 4 + 2);
    expect(x1).toBeGreaterThanOrEqual(4 * 4 + 1);
    expect(y0).toBeLessThanOrEqual(3 * 4 + 2);
    expect(y1).toBeGreaterThanOrEqual(3 * 4 + 1);
  });

  it("values are 0 or 255 at the photo's size", () => {
    const logits = Float32Array.from({ length: 4 * 4 }, (_, i) => (i % 3) - 1);
    const { mask } = upscaleMask(logits, 0, 4, 4, 10, 7);
    expect(mask.length).toBe(70);
    expect(mask.every((v) => v === 0 || v === 255)).toBe(true);
  });
});

describe("de-duplication (mask NMS at 0.7 on the native masks)", () => {
  const sq = (x0, y0, x1, y1, n = 10) => {
    const m = new Uint8Array(n * n);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * n + x] = 1;
    return m;
  };

  it("drops a lower-scored near-copy, keeps a separate instance", () => {
    const cands = [
      { q: 4, score: 0.95, binary: sq(0, 0, 5, 5) },
      { q: 9, score: 0.9, binary: sq(0, 0, 5, 4) }, // IoU 0.8 → duplicate
      { q: 2, score: 0.8, binary: sq(6, 6, 9, 9) },
      { q: 3, score: 0.7, binary: sq(0, 0, 5, 3) }, // IoU 0.6 → kept
    ];
    expect(maskNms(cands, 0.7).map((c) => c.q)).toEqual([4, 2, 3]);
  });

  it("binaryIoU and nativeBinary", () => {
    expect(binaryIoU(sq(0, 0, 2, 2), sq(0, 0, 2, 2))).toBe(1);
    expect(binaryIoU(sq(0, 0, 0, 0), sq(0, 0, 0, 0))).toBe(0);
    const logits = Float32Array.from([-1, 2, 0, 3, 0.1, -0.1, 5, -5]);
    expect([...nativeBinary(logits, 1, 2, 2)]).toEqual([1, 0, 1, 0]);
  });
});

describe("prompt relevance (selection for box / point prompts)", () => {
  const W = 10;
  const H = 10;
  const inst = (box) => {
    const mask = new Uint8Array(W * H);
    for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) mask[y * W + x] = 255;
    return { box, mask };
  };

  it("a positive point inside a mask outranks one outside it; negatives are ignored", () => {
    const a = inst([0, 0, 3, 3]);
    const b = inst([5, 5, 9, 9]);
    const r = promptRelevance([a, b], [{ point: { x: 6, y: 6 }, label: 1 }, { point: { x: 1, y: 1 }, label: 0 }], W, H);
    expect(r).toEqual([0, 3]);
  });

  it("a positive box adds IoU plus 1 for a contained centre", () => {
    const a = inst([0, 0, 4, 4]);
    const r = promptRelevance([a], [{ box: [0, 0, 4, 4], label: 1 }], W, H);
    expect(r[0]).toBeCloseTo(2, 9);
  });
});
