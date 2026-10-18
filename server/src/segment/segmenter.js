// SPDX-License-Identifier: MIT
// SAM 3 through ONNX Runtime in Node: samexporter's three-model bundle (image encoder, language
// encoder, decoder — models.js) with onnxruntime-node, sharp for the image, and tokenizers.js for
// CLIP's BPE. One encode per photo; every text prompt, box and point re-uses its embeddings.
//
//   const seg = await createSegmenter({ modelDir });
//   const h = await seg.encode("house.jpg");            // { id, width, height, encodeMs }
//   const doors = await seg.findText(h, "garage door"); // [{ score, box, mask, area }]
//   seg.release(h); await seg.dispose();
//
// Execution providers: "auto" tries DirectML on Windows (onnxruntime-node's `dml`), else the CPU.
// A provider that fails to create a session, or later fails a run, falls back to the CPU for that
// model (logged) and the call goes on. CPU sessions run with the memory arena off (the probe: peak
// RSS 10.8 GiB with it, 6.7 GiB without — just-house-paint RESEARCH §10).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Tokenizer } from "@huggingface/tokenizers";
import ort from "onnxruntime-node";
import sharp from "sharp";
import { maskToPng, pngToMask } from "./masks.js";
import {
  boxToCxcywh,
  clampBox,
  cxcywhToBox,
  DEFAULT_THRESHOLD,
  geometryArrays,
  IMAGE_SIZE,
  MAX_GEOMETRY,
  maskNms,
  NMS_IOU,
  nativeBinary,
  pointToCxcywh,
  promptRelevance,
  scoreQueries,
  tokenize,
  upscaleMask,
} from "./postprocess.js";

export { maskToPng, pngToMask };

export const MODEL_NAMES = Object.freeze({
  image: "sam3_image_encoder.onnx",
  language: "sam3_language_encoder.onnx",
  decoder: "sam3_decoder.onnx",
});
export const PROVIDERS = Object.freeze(["cpu", "dml", "webgpu"]);
const EMBEDDINGS = ["vision_pos_enc_0", "vision_pos_enc_1", "vision_pos_enc_2", "backbone_fpn_0", "backbone_fpn_1", "backbone_fpn_2"];
const NO_PHRASE = "visual"; // samexporter's default text when only geometry is given

/** A logger from whatever the caller passed: an object with info/warn (or the kit's `warning`), a
 * function `(level, message)`, or nothing (silent). */
export function normalizeLog(log) {
  if (typeof log === "function") return { info: (m) => log("info", m), warn: (m) => log("warn", m) };
  const pick = (...names) => {
    for (const n of names) if (typeof log?.[n] === "function") return (m) => log[n](m);
    return () => {};
  };
  return { info: pick("info"), warn: pick("warn", "warning") };
}

/** The provider each model asks for first. `executionProvider` is "auto", "cpu", "dml", "webgpu",
 * or `{ image, language, decoder }` with any of those per model. "auto" = dml on Windows, else cpu. */
export function resolveProviders(executionProvider = "auto", platform = process.platform) {
  const one = (ep) => {
    const v = ep ?? "auto";
    if (v === "auto") return platform === "win32" ? "dml" : "cpu";
    if (!PROVIDERS.includes(v)) throw new RangeError(`executionProvider must be "auto", ${PROVIDERS.map((p) => `"${p}"`).join(", ")}, not ${JSON.stringify(v)}`);
    return v;
  };
  if (executionProvider && typeof executionProvider === "object") {
    return { image: one(executionProvider.image), language: one(executionProvider.language), decoder: one(executionProvider.decoder) };
  }
  const ep = one(executionProvider);
  return { image: ep, language: ep, decoder: ep };
}

/** Session options per provider. DirectML wants memory patterns off and sequential execution
 * (onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html#configuration-options). */
export function sessionOptions(ep, { threads = 0, cpuMemArena = false } = {}) {
  const base = { graphOptimizationLevel: "all", enableCpuMemArena: cpuMemArena, logSeverityLevel: 3 };
  if (threads > 0) base.intraOpNumThreads = threads;
  if (ep === "dml") return { ...base, executionProviders: ["dml"], enableMemPattern: false, executionMode: "sequential" };
  if (ep === "webgpu") return { ...base, executionProviders: ["webgpu"] };
  return { ...base, executionProviders: ["cpu"] };
}

const errText = (err) => String(err?.message ?? err).trim();

/** One model's session: `ep` first, the CPU when that fails. Returns the slot `{ key, file, ep,
 * wanted, session, loadMs, fallback }` (fallback: why the wanted provider was dropped, or null). */
export async function openSlot(ortApi, key, file, wanted, opts, log) {
  const t0 = performance.now();
  try {
    const session = await ortApi.InferenceSession.create(file, sessionOptions(wanted, opts));
    return { key, file, ep: wanted, wanted, session, loadMs: performance.now() - t0, fallback: null };
  } catch (err) {
    if (wanted === "cpu") throw err;
    const why = `could not create the ${key} session on ${wanted}: ${errText(err)}`;
    log.warn(`${why} — using the CPU`);
    const session = await ortApi.InferenceSession.create(file, sessionOptions("cpu", opts));
    return { key, file, ep: "cpu", wanted, session, loadMs: performance.now() - t0, fallback: why };
  }
}

/** Run a slot; when a non-CPU provider throws, swap the slot to a CPU session and run again. */
export async function runSlot(ortApi, slot, feeds, opts, log) {
  try {
    return await slot.session.run(feeds);
  } catch (err) {
    if (slot.ep === "cpu") throw err;
    const why = `the ${slot.key} model failed to run on ${slot.ep}: ${errText(err)}`;
    log.warn(`${why} — switching it to the CPU`);
    try {
      await slot.session.release();
    } catch {
      /* the failed session may already be unusable */
    }
    slot.session = await ortApi.InferenceSession.create(slot.file, sessionOptions("cpu", opts));
    slot.ep = "cpu";
    slot.fallback = why;
    return slot.session.run(feeds);
  }
}

/** A promise chain: one model call at a time (DirectML can't run one session from two threads, and
 * one at a time keeps peak memory to a single run). */
function serial() {
  let tail = Promise.resolve();
  return (fn) => {
    const next = tail.then(fn, fn);
    tail = next.catch(() => {});
    return next;
  };
}

/**
 * Load the three SAM 3 models. `modelDir` holds the bundle (models.js MODEL_FILES); `tokenizerDir`
 * (default `modelDir`) holds CLIP's tokenizer.json + tokenizer_config.json. Options: `threads`
 * (ONNX Runtime intra-op threads, 0 = its default), `cpuMemArena` (default false), `log`.
 */
export async function createSegmenter({
  modelDir,
  tokenizerDir = modelDir,
  executionProvider = "auto",
  log = null,
  threads = 0,
  cpuMemArena = false,
  ortApi = ort, // tests inject a fake
} = {}) {
  if (!modelDir) throw new TypeError("createSegmenter needs { modelDir }");
  const logger = normalizeLog(log);
  const opts = { threads, cpuMemArena };
  const wanted = resolveProviders(executionProvider);

  const [tokJson, tokConfig] = await Promise.all(
    ["tokenizer.json", "tokenizer_config.json"].map(async (f) => JSON.parse(await readFile(path.join(tokenizerDir, f), "utf8"))),
  );
  const tokenizer = new Tokenizer(tokJson, tokConfig);

  const slots = {};
  try {
    for (const key of ["image", "language", "decoder"]) {
      slots[key] = await openSlot(ortApi, key, path.join(modelDir, MODEL_NAMES[key]), wanted[key], opts, logger);
      logger.info(`SAM 3 ${key} model on ${slots[key].ep} (${Math.round(slots[key].loadMs)} ms)`);
    }
  } catch (err) {
    for (const s of Object.values(slots)) await s.session.release().catch(() => {}); // don't leak the ones that loaded
    throw err;
  }

  const exclusive = serial();
  const handles = new Map(); // handle → { embeddings }
  const textCache = new Map(); // phrase → language encoder outputs (they don't depend on the photo)
  let seq = 0;
  let disposed = false;

  const alive = () => {
    if (disposed) throw new Error("this segmenter was disposed");
  };
  const embeddingsOf = (handle) => {
    const e = handles.get(handle);
    if (!e) throw new Error("unknown or released image handle");
    return e;
  };
  const run = (key, feeds) => runSlot(ortApi, slots[key], feeds, opts, logger);

  async function textFeatures(phrase) {
    const key = phrase.trim().toLowerCase();
    let lang = textCache.get(key);
    if (!lang) {
      const tokens = tokenize(tokenizer, phrase);
      lang = await run("language", { tokens: new ortApi.Tensor("int64", tokens, [1, tokens.length]) });
      textCache.set(key, lang);
    }
    return lang;
  }

  /** Decoder run + post-processing → instances best first, de-duplicated (mask NMS on the native
   * masks). `marks` are the geometry prompts, already normalized. */
  async function decode(handle, phrase, marks, threshold) {
    const emb = embeddingsOf(handle);
    const lang = await textFeatures(phrase);
    const g = geometryArrays(marks);
    const scalar = (v) => new ortApi.Tensor("int64", BigInt64Array.from([BigInt(v)]), []);
    const feeds = {
      original_height: scalar(handle.height),
      original_width: scalar(handle.width),
      ...emb,
      language_mask: lang.text_attention_mask,
      language_features: lang.text_memory,
      language_embeds: lang.text_embeds,
      box_coords: new ortApi.Tensor("float32", g.coords, [MAX_GEOMETRY, 1, 4]),
      box_labels: new ortApi.Tensor("int64", g.labels, [MAX_GEOMETRY, 1]),
      box_masks: new ortApi.Tensor("bool", g.unused, [1, MAX_GEOMETRY]),
    };
    const out = await run("decoder", feeds);
    const [mh, mw] = out.pred_masks.dims.slice(2);
    const masks = out.pred_masks.data;
    const boxes = out.pred_boxes.data;
    const candidates = scoreQueries(out.pred_logits.data, out.presence_logit_dec.data[0], threshold);
    for (const c of candidates) c.binary = nativeBinary(masks, c.q, mw, mh);
    const kept = maskNms(candidates, NMS_IOU);
    const instances = kept.map((c) => {
      const { mask, area } = upscaleMask(masks, c.q, mw, mh, handle.width, handle.height);
      const box = cxcywhToBox(boxes.subarray(c.q * 4, c.q * 4 + 4), handle.width, handle.height);
      return { score: c.score, box, mask, area };
    });
    for (const t of Object.values(out)) t.dispose?.();
    return instances;
  }

  function release(handle) {
    const e = handles.get(handle);
    if (!e) return false;
    handles.delete(handle);
    for (const t of Object.values(e)) t.dispose?.();
    return true;
  }

  /** Geometry prompts as a selection (samexporter's default "auto" output mode): the one instance
   * that best overlaps the positive marks; `mode: "all"` returns every matching instance instead. */
  function select(instances, marks, handle, mode) {
    if (mode === "all" || instances.length < 2) return instances;
    const relevance = promptRelevance(instances, marks, handle.width, handle.height);
    const order = instances.map((inst, i) => ({ inst, r: relevance[i] })).sort((a, b) => b.r - a.r || b.inst.score - a.inst.score);
    return [order[0].inst];
  }

  return {
    /** The provider each model ended up on, and why a fallback happened. */
    get providers() {
      const p = {};
      for (const [k, s] of Object.entries(slots)) p[k] = { ep: s.ep, wanted: s.wanted, fallback: s.fallback, loadMs: Math.round(s.loadMs) };
      return p;
    },

    /** Encode a photo (path or Buffer; EXIF orientation applied) → a handle `{ id, width, height,
     * encodeMs }`. Keep it for every prompt on that photo; `release` it when done (~220 MB). */
    encode(input) {
      alive();
      return exclusive(async () => {
        const t0 = performance.now();
        const meta = await sharp(input).metadata();
        const { width, height } = meta.autoOrient ?? meta;
        const { data, info } = await sharp(input)
          .autoOrient()
          .removeAlpha()
          .toColourspace("srgb")
          .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: "fill", kernel: "linear", fastShrinkOnLoad: false })
          .raw()
          .toBuffer({ resolveWithObject: true });
        if (info.channels !== 3) throw new Error(`expected 3 channels after decoding, got ${info.channels}`);
        const n = IMAGE_SIZE * IMAGE_SIZE;
        const chw = new Uint8Array(3 * n);
        for (let i = 0; i < n; i++) {
          chw[i] = data[i * 3];
          chw[n + i] = data[i * 3 + 1];
          chw[2 * n + i] = data[i * 3 + 2];
        }
        const out = await run("image", { image: new ortApi.Tensor("uint8", chw, [3, IMAGE_SIZE, IMAGE_SIZE]) });
        const embeddings = {};
        for (const name of EMBEDDINGS) {
          if (!out[name]) throw new Error(`the image encoder returned no ${name}`);
          embeddings[name] = out[name];
        }
        const handle = Object.freeze({ id: ++seq, width, height, encodeMs: performance.now() - t0 });
        handles.set(handle, embeddings);
        return handle;
      });
    },

    /** Every instance of a noun phrase: `[{ score, box: [x0,y0,x1,y1] px, mask, area }]`, best first,
     * scores over `threshold` (σ(logit)·σ(presence)), duplicates removed (mask IoU > 0.7). */
    findText(handle, phrase, { threshold = DEFAULT_THRESHOLD } = {}) {
      alive();
      return exclusive(() => decode(handle, phrase, [], threshold));
    },

    /** Box prompts (`[x0,y0,x1,y1]` or `{ box, label: 1|0 }`, pixels, at most 8) — SAM 3 exemplars,
     * with an optional `phrase` (default "visual"). `mode: "select"` (default) returns the one
     * instance the boxes point at; `"all"` every look-alike ("tap one, find all"). */
    findBoxes(handle, boxes, { phrase = NO_PHRASE, threshold = DEFAULT_THRESHOLD, mode = "select" } = {}) {
      alive();
      return exclusive(async () => {
        embeddingsOf(handle);
        if (!boxes?.length) throw new RangeError("findBoxes needs at least one box");
        const marks = boxes.map((b) => {
          const m = Array.isArray(b) ? { box: b, label: 1 } : { box: b.box, label: b.label ?? 1 };
          if (m.label !== 0 && m.label !== 1) throw new RangeError("a box label must be 1 (include) or 0 (exclude)");
          const box = clampBox(m.box, handle.width, handle.height);
          return { box, label: m.label, cxcywh: boxToCxcywh(box, handle.width, handle.height) };
        });
        return select(await decode(handle, phrase, marks, threshold), marks, handle, mode);
      });
    },

    /** Point prompts `[{ x, y, label: 1|0 }]` in pixels. The decoder has no point input: each point
     * goes in as a 1%-size exemplar box (samexporter's approximation), so this finds "things like what
     * is under the tap", not SAM 1/2's click-to-segment. Options as findBoxes. */
    findPoints(handle, points, { phrase = NO_PHRASE, threshold = DEFAULT_THRESHOLD, mode = "select" } = {}) {
      alive();
      return exclusive(async () => {
        embeddingsOf(handle);
        if (!points?.length) throw new RangeError("findPoints needs at least one point");
        const marks = points.map((p) => {
          const label = p.label ?? 1;
          if (label !== 0 && label !== 1) throw new RangeError("a point label must be 1 (include) or 0 (exclude)");
          if (!(p.x >= 0 && p.x < handle.width && p.y >= 0 && p.y < handle.height)) {
            throw new RangeError(`point (${p.x}, ${p.y}) is outside the ${handle.width}×${handle.height} photo`);
          }
          return { point: { x: p.x, y: p.y }, label, cxcywh: pointToCxcywh(p, handle.width, handle.height) };
        });
        return select(await decode(handle, phrase, marks, threshold), marks, handle, mode);
      });
    },

    /** Free a photo's embeddings; false when the handle was unknown or already released. */
    release,

    /** Release every handle, the cached text features and the three sessions. */
    dispose() {
      if (disposed) return Promise.resolve();
      disposed = true;
      return exclusive(async () => {
        for (const h of [...handles.keys()]) release(h);
        for (const lang of textCache.values()) for (const t of Object.values(lang)) t.dispose?.();
        textCache.clear();
        for (const s of Object.values(slots)) await s.session.release();
      });
    },
  };
}
