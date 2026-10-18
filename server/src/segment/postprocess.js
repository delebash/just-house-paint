// SPDX-License-Identifier: MIT
// SAM 3 pre/post-processing for samexporter's ONNX bundle (huggingface.co/nrl-ai/samexporter-onnx-models,
// folder sam3/). A JS port of samexporter's `samexporter/sam3_onnx.py` (MIT,
// github.com/vietanhdev/samexporter) — no JS runtime for this bundle exists (just-house-paint
// RESEARCH §10, "SAM 3 through ONNX Runtime in Node"). Pure functions: no ONNX Runtime, no I/O.
//
// The graph contract (read from the bundle with scripts/inspect.js):
//   image encoder    image uint8 [3,1008,1008] (stretched; the graph normalizes)
//   language encoder tokens int64 [1,32] — CLIP BPE ids padded with 0 (the graph's mask is tokens != 0)
//   decoder          box_coords float32 [8,1,4] normalized cx,cy,w,h · box_labels int64 [8,1] ·
//                    box_masks bool [1,8] (true = unused slot) → pred_boxes [1,200,4] cx,cy,w,h ·
//                    pred_logits [1,200,1] · pred_masks [1,200,288,288] (logits) · presence_logit_dec [1,1]
//   There is no point input: samexporter approximates a point as a 1%-size exemplar box.

export const IMAGE_SIZE = 1008;
export const CONTEXT_LENGTH = 32;
export const MAX_GEOMETRY = 8;
export const POINT_BOX_SIZE = 0.01; // samexporter: "Point is represented as a very small box (1 % of image)"
export const NMS_IOU = 0.7; // samexporter's default --nms_threshold
export const DEFAULT_THRESHOLD = 0.5; // samexporter's default --confidence_threshold

/** samexporter's sigmoid, clipped to ±80 so exp() never overflows. */
export const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-80, Math.min(80, x))));

/** CLIP ids → the language encoder's int64 [32] row, padded with 0 (not EOT): the graph builds its
 * attention mask as `tokens != 0`. Longer prompts are an error, as in samexporter's tokenizer. */
export function padTokens(ids, contextLength = CONTEXT_LENGTH) {
  if (ids.length > contextLength) {
    throw new RangeError(`the prompt is ${ids.length} tokens; SAM 3's limit is ${contextLength} (start and end included)`);
  }
  const out = new BigInt64Array(contextLength);
  for (let i = 0; i < ids.length; i++) out[i] = BigInt(ids[i]);
  return out;
}

/** A phrase through a tokenizers.js CLIP tokenizer (it adds <|startoftext|> … <|endoftext|>). */
export function tokenize(tokenizer, phrase) {
  if (typeof phrase !== "string" || !phrase.trim()) throw new TypeError("a text prompt must be a non-empty string");
  return padTokens(tokenizer.encode(phrase).ids);
}

/** Pixel [x0,y0,x1,y1] → normalized [cx,cy,w,h] (the decoder's box_coords). */
export function boxToCxcywh(box, width, height) {
  const [x0, y0, x1, y1] = box;
  if (![x0, y0, x1, y1].every(Number.isFinite) || !(x1 > x0 && y1 > y0)) {
    throw new RangeError(`a box must be [x0, y0, x1, y1] with positive area, not ${JSON.stringify(box)}`);
  }
  return [(x0 + x1) / 2 / width, (y0 + y1) / 2 / height, (x1 - x0) / width, (y1 - y0) / height];
}

/** Normalized [cx,cy,w,h] (the decoder's pred_boxes) → pixel [x0,y0,x1,y1]. */
export function cxcywhToBox(c, width, height) {
  const [cx, cy, w, h] = c;
  return [(cx - w / 2) * width, (cy - h / 2) * height, (cx + w / 2) * width, (cy + h / 2) * height];
}

/** Pixel point → the 1%-size exemplar box samexporter uses for a point. */
export function pointToCxcywh(point, width, height) {
  return [point.x / width, point.y / height, POINT_BOX_SIZE, POINT_BOX_SIZE];
}

/** Clamp a pixel box into the image. */
export function clampBox(box, width, height) {
  const cx = (v) => Math.min(Math.max(v, 0), width);
  const cy = (v) => Math.min(Math.max(v, 0), height);
  return [cx(box[0]), cy(box[1]), cx(box[2]), cy(box[3])];
}

/** The decoder's three geometry inputs: up to 8 marks `{cxcywh, label}`, the rest padded
 * (coords 0, label 1, box_masks true = unused), as samexporter pads them. */
export function geometryArrays(marks = []) {
  if (marks.length > MAX_GEOMETRY) {
    throw new RangeError(`the SAM 3 decoder takes at most ${MAX_GEOMETRY} boxes or points, not ${marks.length}`);
  }
  const coords = new Float32Array(MAX_GEOMETRY * 4);
  const labels = new BigInt64Array(MAX_GEOMETRY).fill(1n);
  const unused = new Uint8Array(MAX_GEOMETRY).fill(1);
  marks.forEach((m, i) => {
    coords.set(m.cxcywh, i * 4);
    labels[i] = BigInt(m.label);
    unused[i] = 0;
  });
  return { coords, labels, unused };
}

/** Queries over the threshold, best first: score = σ(logit)·σ(presence) (samexporter
 * postprocess_raw_outputs); strict `>`, non-finite scores dropped, stable order on ties. */
export function scoreQueries(logits, presenceLogit, threshold = DEFAULT_THRESHOLD) {
  const presence = sigmoid(presenceLogit);
  const out = [];
  for (let q = 0; q < logits.length; q++) {
    const score = sigmoid(logits[q]) * presence;
    if (Number.isFinite(score) && score > threshold) out.push({ q, score });
  }
  return out.sort((a, b) => b.score - a.score || a.q - b.q);
}

/** One query's native mask (logit > 0) as 0/1, from the [Q, mh, mw] mask logits. */
export function nativeBinary(maskLogits, q, mw, mh) {
  const n = mw * mh;
  const base = q * n;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = maskLogits[base + i] > 0 ? 1 : 0;
  return out;
}

/** IoU of two equal-length 0/1 (or 0/255) masks. */
export function binaryIoU(a, b) {
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i] !== 0;
    const r = b[i] !== 0;
    if (p && r) inter++;
    if (p || r) uni++;
  }
  return uni > 0 ? inter / uni : 0;
}

/** Mask-IoU NMS (SAM 3's official de-duplication; samexporter --sam3_nms_mode mask) on the native
 * 288×288 masks, as the probe does: candidates arrive best first, each with `.binary`; a candidate
 * whose IoU with a kept one is over `iou` is dropped. */
export function maskNms(candidates, iou = NMS_IOU) {
  const kept = [];
  for (const c of candidates) {
    if (!kept.some((k) => binaryIoU(c.binary, k.binary) > iou)) kept.push(c);
  }
  return kept;
}

/** Per-axis bilinear sample positions, OpenCV INTER_LINEAR half-pixel centres. */
function axis(dst, src) {
  const i0 = new Int32Array(dst);
  const i1 = new Int32Array(dst);
  const f = new Float32Array(dst);
  const scale = src / dst;
  for (let d = 0; d < dst; d++) {
    const s = Math.min(Math.max((d + 0.5) * scale - 0.5, 0), src - 1);
    i0[d] = Math.floor(s);
    i1[d] = Math.min(i0[d] + 1, src - 1);
    f[d] = s - i0[d];
  }
  return { i0, i1, f };
}

/**
 * One query's 288×288 mask logits → a full-size 8-bit mask (0/255): bilinear on the logits
 * (cv2.resize INTER_LINEAR), then > 0 — samexporter's σ(resize(logits)) > 0.5. Exact, but only the
 * rows and columns whose source cells reach a positive logit are interpolated (a bilinear value
 * is a convex mix of its four cells, so it can't be > 0 where they are all ≤ 0).
 * Returns `{ mask, area, bbox }` (bbox [x0,y0,x1,y1] inclusive pixels, null when empty).
 */
export function upscaleMask(maskLogits, q, srcW, srcH, dstW, dstH) {
  const base = q * srcW * srcH;
  let sx0 = srcW;
  let sy0 = srcH;
  let sx1 = -1;
  let sy1 = -1;
  for (let y = 0; y < srcH; y++) {
    const row = base + y * srcW;
    for (let x = 0; x < srcW; x++) {
      if (maskLogits[row + x] > 0) {
        if (x < sx0) sx0 = x;
        if (x > sx1) sx1 = x;
        if (y < sy0) sy0 = y;
        if (y > sy1) sy1 = y;
      }
    }
  }
  const mask = new Uint8Array(dstW * dstH);
  if (sx1 < 0) return { mask, area: 0, bbox: null };
  const ax = axis(dstW, srcW);
  const ay = axis(dstH, srcH);
  // The destination span whose sample cells touch the source bbox (i0/i1 never decrease).
  let xa = 0;
  while (xa < dstW && ax.i1[xa] < sx0) xa++;
  let xb = dstW - 1;
  while (xb >= 0 && ax.i0[xb] > sx1) xb--;
  let ya = 0;
  while (ya < dstH && ay.i1[ya] < sy0) ya++;
  let yb = dstH - 1;
  while (yb >= 0 && ay.i0[yb] > sy1) yb--;
  let area = 0;
  let minX = dstW;
  let minY = dstH;
  let maxX = -1;
  let maxY = -1;
  for (let y = ya; y <= yb; y++) {
    const r0 = base + ay.i0[y] * srcW;
    const r1 = base + ay.i1[y] * srcW;
    const fy = ay.f[y];
    const out = y * dstW;
    for (let x = xa; x <= xb; x++) {
      const fx = ax.f[x];
      const a = maskLogits[r0 + ax.i0[x]] * (1 - fx) + maskLogits[r0 + ax.i1[x]] * fx;
      const b = maskLogits[r1 + ax.i0[x]] * (1 - fx) + maskLogits[r1 + ax.i1[x]] * fx;
      if (a * (1 - fy) + b * fy > 0) {
        mask[out + x] = 255;
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { mask, area, bbox: area ? [minX, minY, maxX, maxY] : null };
}

/**
 * samexporter's `_prompt_relevance`: how much each instance overlaps the positive marks — a
 * positive point inside the mask counts 2, inside the box 1; a positive rectangle adds its box IoU
 * and 1 when the instance's box centre falls inside it. `instances`: [{ box, mask }] at full size.
 */
export function promptRelevance(instances, marks, width, height) {
  return instances.map((inst) => {
    let r = 0;
    for (const m of marks) {
      if (m.label !== 1) continue;
      const b = inst.box;
      if (m.point) {
        const x = Math.min(Math.max(Math.round(m.point.x), 0), width - 1);
        const y = Math.min(Math.max(Math.round(m.point.y), 0), height - 1);
        if (inst.mask[y * width + x]) r += 2;
        if (b[0] <= x && x <= b[2] && b[1] <= y && y <= b[3]) r += 1;
      } else if (m.box) {
        const p = m.box;
        const iw = Math.max(0, Math.min(b[2], p[2]) - Math.max(b[0], p[0]));
        const ih = Math.max(0, Math.min(b[3], p[3]) - Math.max(b[1], p[1]));
        const inter = iw * ih;
        const union = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]) + Math.max(0, (p[2] - p[0]) * (p[3] - p[1])) - inter;
        if (union > 0) r += inter / union;
        const cx = (b[0] + b[2]) / 2;
        const cy = (b[1] + b[3]) / 2;
        if (p[0] <= cx && cx <= p[2] && p[1] <= cy && cy <= p[3]) r += 1;
      }
    }
    return r;
  });
}
