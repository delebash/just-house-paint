// SPDX-License-Identifier: MIT
// The "AI photo" button: repaint the chosen surfaces of a house photo with FLUX.2 klein 4B
// (stable-diffusion.cpp, masked edit), then paste the render back into the original photo
// inside the surface masks only and lock the painted area to the exact paint color.
//
//   1. the photo and the masks' union go down to the model's working size (multiples of 16);
//   2. `generate` draws it — the kit's image runtime running the app's `aiphoto.render` feature, its
//      preset's recipe (aiphoto_service.js) — the photo is both init and reference image;
//   3. the render comes back up to the photo's full size; outside the (slightly feathered)
//      masks every pixel is the photo's own (the whole frame went through the VAE, so nothing
//      outside is pixel-identical otherwise — RESEARCH §10);
//   4. each surface is locked to its paint: paint × the render's own normalized lighting;
//   5. ΔE2000 of each surface's median normally lit pixel against its paint is measured;
//   6. the close-up: a small surface still far from its paint (the model left it as photographed) is drawn
//      again from a crop around it, grown to the same pixel budget, and kept only when it comes closer.
//
// Several surfaces in one run: sd.cpp takes ONE mask, so the masks' union goes in and the
// prompt names each surface with its color; the lock then gives each surface its own paint.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  colorLock,
  DEFAULT_COMPOSE,
  DEFAULT_WORKING_SIZE,
  deltaEAt,
  featherMask,
  fromRgb,
  lightGain,
  litHexOf,
  luminanceOf,
  paintColor,
  pasteBack,
  pieces,
  readMask,
  readRgb,
  repaintedAlpha,
  surfaceStats,
  unionMaskPng,
  workingSize,
} from "./pixels.js";
import { DEFAULT_PROMPT_TEMPLATES, renderPrompt } from "./prompts.js";

export { colorLock, pasteBack } from "./pixels.js";

/** Where each phase sits in the 0..1 progress (the drawing dominates: ~15–18 s of ~20 s). */
export const PHASES = Object.freeze({ prepare: [0, 0.03], generate: [0.03, 0.95], compose: [0.95, 1] });

function surfacesOf({ surfaces, mask, colorHex, colorName, surfaceLabel, currentHex }) {
  const list = surfaces ?? [{ mask, colorHex, colorName, surfaceLabel, currentHex }];
  if (!Array.isArray(list) || !list.length) throw new TypeError("aiRepaint: no surfaces");
  return list.map((s, i) => {
    if (!s?.mask) throw new TypeError(`aiRepaint: surface ${i} has no mask`);
    paintColor(s.colorHex); // throws on a malformed hex
    if (s.currentHex) paintColor(s.currentHex);
    const label = String(s.surfaceLabel ?? "").trim();
    if (!label) throw new TypeError(`aiRepaint: surface ${i} has no surfaceLabel`);
    // currentHex: the paint the surface has now, when its owner knows it — the lock works out the
    // light on it from that (lightGain) and paints the new color in that light
    return { mask: s.mask, colorHex: s.colorHex.toLowerCase(), colorName: s.colorName ?? null, surfaceLabel: label, currentHex: s.currentHex ?? null };
  });
}

/** The size the photo is read at: its own, or scaled down (aspect kept) to `maxPixels`; null = its own. */
export async function cappedSize(photo, maxPixels) {
  if (!maxPixels) return null;
  const { width, height } = await sharp(photo).metadata();
  if (!width || !height || width * height <= maxPixels) return null;
  const s = Math.sqrt(maxPixels / (width * height));
  return { width: Math.max(1, Math.floor(width * s)), height: Math.max(1, Math.floor(height * s)) };
}

function sizeFor(size, width, height, rule) {
  if (size && typeof size === "object") {
    if (size.width % 16 || size.height % 16) throw new RangeError(`aiRepaint: size ${size.width}x${size.height} is not a multiple of 16`);
    return { width: size.width, height: size.height };
  }
  if (typeof size === "number") return workingSize(width, height, { ...rule, targetPixels: size });
  return workingSize(width, height, rule);
}

/**
 * Repaint surfaces of `photo` with the local image model.
 *
 * One surface: `{mask, colorHex, colorName?, surfaceLabel}`; several: `surfaces: [{…}]`
 * (where masks overlap, the later surface's paint wins). `generate(request, {onProgress, signal})`
 * draws: `request` `{prompt, width, height, init, refs, mask}` (PNG Buffers, as the kit's
 * runImageFeature takes it) → the render as a PNG Buffer; its `onProgress({step, steps, fraction})`.
 * `photo`/`mask` are paths or Buffers (mask: white = the surface, any size — it is stretched to the photo).
 * `size` = an exact working `{width, height}` (multiples of 16) or a pixel budget.
 * `onProgress({fraction, stage, step, steps})`; `signal` cancels (the drawing stops at its next step).
 *
 * → `{path, timings: {prepareMs, generateMs, closeUpMs, composeMs, totalMs}, deltaE, deltaEUnlocked,
 *    surfaces: [{surfaceLabel, colorHex, deltaE, deltaEUnlocked, litMedian, litPixels}],
 *    closeUp: [{surfaceLabel, before, after, kept, workingSize, crop}], prompt, workingSize, size}` — `deltaE` is the
 *    worst surface's ΔE2000 after the lock, `deltaEUnlocked` the same measure on the AI's own colors (paste-back
 *    without the lock); `closeUp` each surface drawn again up close (step 6), its ΔE before and after. While one is
 *    drawn, `onProgress` has `stage: "closeUp"` and `closeUp`, its index in the surfaces.
 */
export async function aiRepaint(opts) {
  const {
    generate,
    photo,
    outPath,
    size = null,
    onProgress = null,
    signal = null,
    compose = DEFAULT_COMPOSE,
    templates = DEFAULT_PROMPT_TEMPLATES,
    workingSizeRule = DEFAULT_WORKING_SIZE,
    unlockedPath = null,
    renderPath = null,
    workDir = null,
    keepWork = false,
    maxPixels = null,
  } = opts;
  const t0 = performance.now();
  signal?.throwIfAborted();
  const list = surfacesOf(opts);
  if (typeof generate !== "function") throw new TypeError("aiRepaint: generate (the image feature's run) is required");
  if (!photo || !outPath) throw new TypeError("aiRepaint: photo and outPath are required");
  const c = { ...DEFAULT_COMPOSE, ...compose };
  const report = (phase, f, extra = {}) => {
    const [lo, hi] = PHASES[phase];
    onProgress?.({ stage: phase, ...extra, fraction: lo + (hi - lo) * Math.max(0, Math.min(1, f)) });
  };

  const work = await mkdtemp(join(workDir ?? tmpdir(), "aiphoto-"));
  try {
    // 1. Prepare: the photo at full size, each mask at full size, the working-size inputs. Full size is at
    // most `maxPixels` (Settings → General, photos.fullSizeMaxMegapixels): a 48 MP photo held 6 GB composing.
    report("prepare", 0);
    const full = await readRgb(photo, await cappedSize(photo, maxPixels));
    const W = full.width;
    const H = full.height;
    const ws = sizeFor(size, W, H, workingSizeRule);
    const init = join(work, "init.png");
    const maskPng = join(work, "mask.png");
    const render = join(work, "render.png");
    await fromRgb(full.data, W, H).resize(ws.width, ws.height, { fit: "fill" }).png().toFile(init);
    const hard = [];
    for (const s of list) {
      const m = await readMask(s.mask, W, H);
      if (!m.some((v) => v >= c.insideAt)) throw new RangeError(`aiRepaint: the ${s.surfaceLabel} mask is empty`);
      hard.push(m);
    }
    const small = [];
    for (const s of list) small.push(await readMask(s.mask, ws.width, ws.height));
    await unionMaskPng(small, ws.width, ws.height, maskPng, c.insideAt);
    const prompt = renderPrompt(list, templates);
    const initPng = await readFile(init);
    const request = { prompt, width: ws.width, height: ws.height, init: initPng, refs: [initPng], mask: await readFile(maskPng) };
    signal?.throwIfAborted();
    report("prepare", 1);
    const t1 = performance.now();

    // 2. Generate.
    const drawn = await generate(request, { onProgress: (p) => report("generate", p.fraction, { step: p.step, steps: p.steps }), signal });
    signal?.throwIfAborted();
    await writeFile(render, drawn);
    report("generate", 1);
    const t2 = performance.now();

    // 3–5. Compose at the photo's full size.
    const ai = await readRgb(render, { width: W, height: H });
    if (renderPath) await fromRgb(ai.data, W, H).toFile(renderPath);
    signal?.throwIfAborted();
    const soft = [];
    for (const m of hard) soft.push(await featherMask(m, W, H, c.featherPx));
    const union = new Float32Array(W * H);
    for (const m of soft) for (let i = 0; i < union.length; i++) if (m[i] > union[i]) union[i] = m[i];
    const photoY = list.some((s) => s.currentHex) ? luminanceOf(full.data) : null;
    // the pixels each surface owns (a later surface wins) and their pieces — each shutter, each door
    const owned = hard.map((m, s) => {
      const o = Float32Array.from(m);
      for (let t = s + 1; t < list.length; t++) for (let i = 0; i < o.length; i++) if (hard[t][i] >= c.insideAt) o[i] = 0;
      return o;
    });
    const parts = owned.map((o) => pieces(o, W, c.insideAt));

    // The picture from a drawing at full size (`aiData`): the paste-back, then each surface locked to its paint.
    // Each surface's lighting statistics over the pixels it owns, each piece's level within pieceLight of the
    // typical piece's (the drawing's light, not one piece the model drew lighter or darker). The lock goes over the
    // paste-back, only where the AI repainted (c.lockOnlyRepainted) — unless the paint is close to the surface's old
    // color, when the whole surface is locked. A surface whose paint now is known is locked in the light that paint
    // says falls on it, read off the photo's own pixels (not the render's); its ΔE is to the paint in that light.
    const composeFrom = (aiData) => {
      const Y = luminanceOf(aiData);
      const unlocked = pasteBack(full.data, aiData, union);
      let locked = c.lockOnlyRepainted ? unlocked : full.data;
      const results = [];
      for (let s = 0; s < list.length; s++) {
        const stats = surfaceStats(Y, owned[s], c, parts[s]);
        const gain = list[s].currentHex ? lightGain(full.data, surfaceStats(photoY, hard[s], c).lit, list[s].currentHex, c) : [1, 1, 1];
        const target = litHexOf(list[s].colorHex, gain);
        let lockAlpha = soft[s];
        if (c.lockOnlyRepainted) {
          const old = deltaEAt(full.data, stats.inside, target).deltaE;
          if (old === null || old >= c.sameColorDeltaE) lockAlpha = repaintedAlpha(full.data, aiData, soft[s], c.repaintedRange);
        }
        locked = colorLock(locked, aiData, lockAlpha, list[s].colorHex, stats, Y, gain);
        results.push({ stats, gain, target });
        signal?.throwIfAborted();
      }
      const surfaces = list.map((s, i) => {
        const { stats, gain, target } = results[i];
        const { lit, inside } = stats;
        const after = deltaEAt(locked, lit, target);
        const before = deltaEAt(unlocked, lit, target);
        // The whole surface's median, shade included — how far "one paint" spreads (RESEARCH §10).
        const whole = deltaEAt(locked, inside, target);
        return {
          surfaceLabel: s.surfaceLabel,
          colorHex: s.colorHex,
          litHex: target,
          gain: gain.map(round2),
          deltaE: round2(after.deltaE),
          deltaEUnlocked: round2(before.deltaE),
          deltaESurface: round2(whole.deltaE),
          litMedian: after.median,
          aiLitMedian: before.median,
          surfaceMedian: whole.median,
          litPixels: lit.length,
          surfacePixels: inside.length,
        };
      });
      return { locked, unlocked, surfaces };
    };
    let aiData = ai.data;
    let composed = composeFrom(aiData);
    report("compose", 0.3);

    // 6. The close-up (2026-10-28 — the porch door the model left as photographed, ΔE 37.8): a small surface the
    // drawing left unpainted (ΔE ≥ closeUpDeltaE, its box at most closeUpMaxShare of the photo) is drawn again from a
    // crop around it, so it gets the model's whole canvas; its own pixels take the new drawing, every surface is
    // locked again, and it is kept only when that surface comes closer. At most closeUpMaxParts, the furthest first.
    const closeUp = [];
    const t3 = performance.now();
    // the first drawing's pixel budget (Settings → aiphoto.workingPixels, or an exact size's own) — not the size it
    // was drawn at, which a photo smaller than the budget shrinks
    const budget = typeof size === "number" ? size : size && typeof size === "object" ? size.width * size.height : workingSizeRule.targetPixels;
    const worstOf = (list) => list.reduce((m, s) => (s.deltaE == null ? m : Math.max(m, s.deltaE)), 0);
    const candidates = composed.surfaces
      .map((s, i) => ({ i, deltaE: s.deltaE, box: boxOf(hard[i], W, H, c.insideAt) }))
      .filter((x) => x.deltaE != null && x.deltaE >= c.closeUpDeltaE && x.box && (x.box.width * x.box.height) / (W * H) <= c.closeUpMaxShare)
      .sort((a, b) => b.deltaE - a.deltaE)
      .slice(0, Math.max(0, c.closeUpMaxParts));
    for (const [n, { i, box }] of candidates.entries()) {
      signal?.throwIfAborted();
      const crop = cropAround(box, W, H, c.closeUpMargin);
      const cws = workingSize(crop.width, crop.height, { ...workingSizeRule, targetPixels: budget }, { grow: true });
      const cropInit = await fromRgb(full.data, W, H).extract(crop).resize(cws.width, cws.height, { fit: "fill" }).png().toBuffer();
      const cropMask = await maskCropPng(hard[i], W, crop, cws, c.insideAt);
      const closeRequest = { prompt: renderPrompt([list[i]], templates), width: cws.width, height: cws.height, init: cropInit, refs: [cropInit], mask: cropMask };
      const step = (f) => report("compose", 0.3 + (0.5 * (n + f)) / candidates.length, { stage: "closeUp", closeUp: i });
      const drawnClose = await generate(closeRequest, { onProgress: (p) => step(p.fraction ?? 0), signal });
      signal?.throwIfAborted();
      const back = await sharp(drawnClose).resize(crop.width, crop.height, { fit: "fill" }).removeAlpha().raw().toBuffer();
      // this surface's own pixels take the close-up's drawing; every other pixel keeps the first
      const next = Buffer.from(aiData);
      for (let y = 0; y < crop.height; y++) {
        for (let x = 0; x < crop.width; x++) {
          const p = (crop.top + y) * W + crop.left + x;
          if (soft[i][p] <= 0) continue;
          const q = (y * crop.width + x) * 3;
          next[p * 3] = back[q];
          next[p * 3 + 1] = back[q + 1];
          next[p * 3 + 2] = back[q + 2];
        }
      }
      const tried = composeFrom(next);
      const before = composed.surfaces[i].deltaE;
      const after = tried.surfaces[i].deltaE;
      // kept when this part came closer and no other got worse than the picture's worst was (a neighbour under its
      // outline's edge takes the close-up's pixels too)
      const kept = after != null && after < before && worstOf(tried.surfaces) <= worstOf(composed.surfaces);
      if (kept) {
        aiData = next;
        composed = tried;
      }
      closeUp.push({ surfaceLabel: list[i].surfaceLabel, before, after, kept, workingSize: cws, crop });
    }
    const t4 = performance.now();

    report("compose", 0.8);
    const { locked, unlocked, surfaces } = composed;
    await fromRgb(locked, W, H).toFile(outPath);
    if (unlockedPath) await fromRgb(unlocked, W, H).toFile(unlockedPath);
    const t5 = performance.now();
    report("compose", 1);
    const worst = (key) => surfaces.reduce((m, s) => (s[key] == null ? m : Math.max(m ?? 0, s[key])), null);
    return {
      path: outPath,
      timings: { prepareMs: ms(t1 - t0), generateMs: ms(t2 - t1), closeUpMs: ms(t4 - t3), composeMs: ms(t5 - t2 - (t4 - t3)), totalMs: ms(t5 - t0) },
      deltaE: worst("deltaE"),
      deltaEUnlocked: worst("deltaEUnlocked"),
      surfaces,
      closeUp,
      prompt,
      workingSize: ws,
      size: { width: W, height: H },
    };
  } finally {
    if (!keepWork) await rm(work, { recursive: true, force: true });
  }
}

const ms = (v) => Math.round(v);
const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

/** The box around a full-size mask's inside pixels: { left, top, width, height }, or null when it has none. */
export function boxOf(mask, W, H, insideAt) {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (mask[y * W + x] < insideAt) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** The crop around `box`: `margin` of its longer side on every side — the part with enough of the house around it for
 *  the model to see what it is — kept inside the photo. */
export function cropAround(box, W, H, margin) {
  const pad = Math.round(Math.max(box.width, box.height) * margin);
  const left = Math.max(0, box.left - pad);
  const top = Math.max(0, box.top - pad);
  const right = Math.min(W, box.left + box.width + pad);
  const bottom = Math.min(H, box.top + box.height + pad);
  return { left, top, width: right - left, height: bottom - top };
}

/** A full-size mask's crop at the close-up's working size, as the white-on-black PNG the image feature takes. */
async function maskCropPng(mask, W, crop, size, insideAt) {
  const b = Buffer.alloc(crop.width * crop.height);
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) b[y * crop.width + x] = mask[(crop.top + y) * W + crop.left + x] >= insideAt ? 255 : 0;
  }
  return sharp(b, { raw: { width: crop.width, height: crop.height, channels: 1 } })
    .resize(size.width, size.height, { fit: "fill" })
    .png()
    .toBuffer();
}
