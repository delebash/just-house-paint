// SPDX-License-Identifier: MIT
// The "AI photo" button: repaint the chosen surfaces of a house photo with FLUX.2 klein 4B
// (stable-diffusion.cpp, masked edit), then paste the render back into the original photo
// inside the surface masks only and lock the painted area to the exact paint color.
//
//   1. the photo and the masks' union go down to the model's working size (multiples of 16);
//   2. sd-cli runs the measured recipe (sdcli.js) — the photo is both init and reference image;
//   3. the render comes back up to the photo's full size; outside the (slightly feathered)
//      masks every pixel is the photo's own (the whole frame went through the VAE, so nothing
//      outside is pixel-identical otherwise — RESEARCH §10);
//   4. each surface is locked to its paint: paint × the render's own normalized lighting;
//   5. ΔE2000 of each surface's median normally lit pixel against its paint is measured.
//
// Several surfaces in one run: sd.cpp takes ONE mask, so the masks' union goes in and the
// prompt names each surface with its color; the lock then gives each surface its own paint.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  colorLock,
  DEFAULT_COMPOSE,
  DEFAULT_WORKING_SIZE,
  deltaEAt,
  featherMask,
  fromRgb,
  luminanceOf,
  paintColor,
  pasteBack,
  repaintedAlpha,
  readMask,
  readRgb,
  surfaceStats,
  unionMaskPng,
  workingSize,
} from "./pixels.js";
import { DEFAULT_PROMPT_TEMPLATES, renderPrompt } from "./prompts.js";
import { buildArgs, DEFAULT_SD_RECIPE, runSdCli } from "./sdcli.js";

export { colorLock, pasteBack } from "./pixels.js";

/** Where each phase sits in the 0..1 progress (sd-cli dominates: ~18 s of ~20 s). */
export const PHASES = Object.freeze({ prepare: [0, 0.03], generate: [0.03, 0.95], compose: [0.95, 1] });

function surfacesOf({ surfaces, mask, colorHex, colorName, surfaceLabel }) {
  const list = surfaces ?? [{ mask, colorHex, colorName, surfaceLabel }];
  if (!Array.isArray(list) || !list.length) throw new TypeError("aiRepaint: no surfaces");
  return list.map((s, i) => {
    if (!s?.mask) throw new TypeError(`aiRepaint: surface ${i} has no mask`);
    paintColor(s.colorHex); // throws on a malformed hex
    const label = String(s.surfaceLabel ?? "").trim();
    if (!label) throw new TypeError(`aiRepaint: surface ${i} has no surfaceLabel`);
    return { mask: s.mask, colorHex: s.colorHex.toLowerCase(), colorName: s.colorName ?? null, surfaceLabel: label };
  });
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
 * (where masks overlap, the later surface's paint wins). `engine` = the sd-cli path
 * (ensureEngine's result; `{bin}` also works); `models` = ensureModels's `{diffusion, llm, vae}`. `photo`/`mask`
 * are paths or Buffers (mask: white = the surface, any size — it is stretched to the photo).
 * `size` = an exact working `{width, height}` (multiples of 16) or a pixel budget.
 * `onProgress({fraction, stage, step, steps})`; `signal` cancels (sd-cli is killed).
 *
 * → `{path, timings: {prepareMs, generateMs, composeMs, totalMs}, deltaE, deltaEUnlocked,
 *    surfaces: [{surfaceLabel, colorHex, deltaE, deltaEUnlocked, litMedian, litPixels}],
 *    prompt, workingSize, size}` — `deltaE` is the worst surface's ΔE2000 after the lock,
 *    `deltaEUnlocked` the same measure on the AI's own colors (paste-back without the lock).
 */
export async function aiRepaint(opts) {
  const {
    engine,
    models,
    photo,
    outPath,
    size = null,
    onProgress = null,
    signal = null,
    recipe = DEFAULT_SD_RECIPE,
    compose = DEFAULT_COMPOSE,
    templates = DEFAULT_PROMPT_TEMPLATES,
    workingSizeRule = DEFAULT_WORKING_SIZE,
    unlockedPath = null,
    renderPath = null,
    workDir = null,
    keepWork = false,
    logPath = null,
    onOutput = null,
    spawn,
  } = opts;
  const t0 = performance.now();
  signal?.throwIfAborted();
  const list = surfacesOf(opts);
  const bin = typeof engine === "string" ? engine : engine?.bin;
  if (!bin) throw new TypeError("aiRepaint: engine (the sd-cli path) is required");
  if (!models?.diffusion || !models?.llm || !models?.vae) throw new TypeError("aiRepaint: models {diffusion, llm, vae} are required");
  if (!photo || !outPath) throw new TypeError("aiRepaint: photo and outPath are required");
  const c = { ...DEFAULT_COMPOSE, ...compose };
  const report = (phase, f, extra = {}) => {
    const [lo, hi] = PHASES[phase];
    onProgress?.({ stage: phase, ...extra, fraction: lo + (hi - lo) * Math.max(0, Math.min(1, f)) });
  };

  const work = await mkdtemp(join(workDir ?? tmpdir(), "aiphoto-"));
  try {
    // 1. Prepare: the photo at full size, each mask at full size, the working-size inputs.
    report("prepare", 0);
    const full = await readRgb(photo);
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
    const args = buildArgs({ models, init, ref: init, mask: maskPng, prompt, output: render, ...ws, recipe });
    signal?.throwIfAborted();
    report("prepare", 1);
    const t1 = performance.now();

    // 2. Generate.
    await runSdCli(bin, args, {
      onProgress: (p) => report("generate", p.fraction, { step: p.step, steps: p.steps, sdStage: p.stage }),
      onOutput,
      signal,
      logPath,
      cwd: work,
      ...(spawn ? { spawn } : {}),
    });
    report("generate", 1);
    const t2 = performance.now();

    // 3–5. Compose at the photo's full size.
    const ai = await readRgb(render, { width: W, height: H });
    if (renderPath) await fromRgb(ai.data, W, H).toFile(renderPath);
    signal?.throwIfAborted();
    const Y = luminanceOf(ai.data);
    const soft = [];
    for (const m of hard) soft.push(await featherMask(m, W, H, c.featherPx));
    const union = new Float32Array(W * H);
    for (const m of soft) for (let i = 0; i < union.length; i++) if (m[i] > union[i]) union[i] = m[i];
    const unlocked = pasteBack(full.data, ai.data, union);
    report("compose", 0.3);

    // Each surface's lighting statistics over the pixels it owns (a later surface wins). The lock
    // goes over the paste-back, only where the AI repainted (c.lockOnlyRepainted) — unless the paint
    // is close to the surface's old color, when the whole surface is locked.
    let locked = c.lockOnlyRepainted ? unlocked : full.data;
    const results = [];
    for (let s = 0; s < list.length; s++) {
      const owned = Float32Array.from(hard[s]);
      for (let t = s + 1; t < list.length; t++) for (let i = 0; i < owned.length; i++) if (hard[t][i] >= c.insideAt) owned[i] = 0;
      const stats = surfaceStats(Y, owned, c);
      let lockAlpha = soft[s];
      if (c.lockOnlyRepainted) {
        const old = deltaEAt(full.data, stats.inside, list[s].colorHex).deltaE;
        if (old === null || old >= c.sameColorDeltaE) lockAlpha = repaintedAlpha(full.data, ai.data, soft[s], c.repaintedRange);
      }
      locked = colorLock(locked, ai.data, lockAlpha, list[s].colorHex, stats, Y);
      results.push({ stats });
      signal?.throwIfAborted();
    }
    const surfaces = list.map((s, i) => {
      const { lit, inside } = results[i].stats;
      const after = deltaEAt(locked, lit, s.colorHex);
      const before = deltaEAt(unlocked, lit, s.colorHex);
      // The whole surface's median, shade included — how far "one paint" spreads (RESEARCH §10).
      const whole = deltaEAt(locked, inside, s.colorHex);
      return {
        surfaceLabel: s.surfaceLabel,
        colorHex: s.colorHex,
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
    report("compose", 0.8);
    await fromRgb(locked, W, H).toFile(outPath);
    if (unlockedPath) await fromRgb(unlocked, W, H).toFile(unlockedPath);
    const t3 = performance.now();
    report("compose", 1);
    const worst = (key) => surfaces.reduce((m, s) => (s[key] == null ? m : Math.max(m ?? 0, s[key])), null);
    return {
      path: outPath,
      timings: { prepareMs: ms(t1 - t0), generateMs: ms(t2 - t1), composeMs: ms(t3 - t2), totalMs: ms(t3 - t0) },
      deltaE: worst("deltaE"),
      deltaEUnlocked: worst("deltaEUnlocked"),
      surfaces,
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
