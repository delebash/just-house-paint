// SPDX-License-Identifier: MIT
// The real end-to-end run — gated: it needs the GPU, the sd.cpp zips and the FLUX.2 klein
// weights already on this machine (just-house-paint data/probe/), and takes ~20 s per edit.
//
//   HP_REAL_SD=1 npm run test:real
//
// The engine is installed for real by ensureEngine from the probe's downloaded zips (a local
// copy stands in for the network download; size + SHA-256 are checked against GitHub's
// digests); the weights are read in place. Before each run it waits until the GPU has
// HP_MIN_FREE_MIB (7000) free — another app may hold it — and samples nvidia-smi during the
// run for the peak. The first run's raw sd-cli output is saved as the progress fixture.
// HP_REAL_SD_1MP=1 adds a ~1 MP run for the size/VRAM trade-off.

import { spawn } from "node:child_process";
import { existsSync, rmdirSync, symlinkSync } from "node:fs";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { aiRepaint } from "../../src/aiphoto/edit.js";
import { ensureEngine } from "../../src/aiphoto/engine.js";
import { featherMask, readMask, readRgb, DEFAULT_COMPOSE } from "../../src/aiphoto/pixels.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = process.env.HP_REAL_SD === "1";
// the probe folder in this checkout's data folder (gitignored): its photos, models and engine zips
const PROBE = process.env.HP_PROBE_DIR || join(HERE, "..", "..", "..", "data", "probe");
const OUT = process.env.HP_REAL_OUT || join(PROBE, "out", "aiphoto-real");
const MIN_FREE_MIB = Number(process.env.HP_MIN_FREE_MIB || 7000);

const MODELS = {
  diffusion: `${PROBE}/models/flux2-klein/flux-2-klein-4b-Q8_0.gguf`,
  llm: `${PROBE}/models/flux2-klein/Qwen3-4B-Q8_0.gguf`,
  vae: `${PROBE}/models/flux2-klein/flux2-klein-vae.safetensors`,
};
const PHOTO = `${PROBE}/photos/house1-white-shutters.jpg`;
const BODY = `${PROBE}/out/r2/house1-body.png`;

/** A "download" that copies the probe's already-downloaded zip of the same name. */
async function localCopy(url, dest, { onProgress } = {}) {
  const src = join(PROBE, "bin", "zips", basename(new URL(url).pathname));
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  onProgress?.((await stat(dest)).size, null);
}

function nvidiaSmi(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("nvidia-smi", args, { windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => {
      out += d;
    });
    p.on("error", reject);
    p.on("close", () => resolve(out));
  });
}

const gpuMiB = async (field) => Number((await nvidiaSmi([`--query-gpu=${field}`, "--format=csv,noheader,nounits"])).trim().split(/\r?\n/)[0]);

/** Wait (up to 20 min) until the GPU has `min` MiB free; returns the free MiB seen. */
async function waitForGpu(min = MIN_FREE_MIB) {
  const until = Date.now() + 20 * 60_000;
  for (;;) {
    const free = await gpuMiB("memory.free");
    if (free >= min) return free;
    if (Date.now() > until) throw new Error(`GPU still has only ${free} MiB free`);
    console.log(`[real] GPU ${free} MiB free < ${min} — waiting`);
    await new Promise((r) => setTimeout(r, 15_000));
  }
}

/** Sample memory.used every 200 ms until stop(); → {baseline, peak} in MiB. */
function sampleGpu() {
  const p = spawn("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits", "-lms", "200"], { windowsHide: true });
  const seen = [];
  let buf = "";
  p.stdout.on("data", (d) => {
    buf += d;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const l of lines) if (l.trim()) seen.push(Number(l.trim()));
  });
  return {
    stop: () => {
      p.kill();
      return { baseline: seen[0] ?? null, peak: seen.length ? Math.max(...seen) : null, samples: seen.length };
    },
  };
}

/** Every pixel outside the feathered masks must be the photo's own byte. */
async function outsideIdentical(outPath, masks) {
  const photo = await readRgb(PHOTO);
  const out = await readRgb(outPath);
  const { width: W, height: H } = photo;
  const union = new Float32Array(W * H);
  for (const m of masks) {
    const soft = await featherMask(await readMask(m, W, H), W, H, DEFAULT_COMPOSE.featherPx);
    for (let i = 0; i < union.length; i++) union[i] = Math.max(union[i], soft[i]);
  }
  let outside = 0;
  let differ = 0;
  for (let i = 0; i < union.length; i++) {
    if (union[i] > 0) continue;
    outside++;
    for (let k = 0; k < 3; k++) if (out.data[i * 3 + k] !== photo.data[i * 3 + k]) differ++;
  }
  return { outside, differ, size: [out.width, out.height], photoSize: [W, H] };
}

async function run(name, opts) {
  await mkdir(OUT, { recursive: true });
  const engine = await ensureEngine(join(OUT, "engine"), { download: localCopy, gpu: { cuda: true } });
  const freeBefore = await waitForGpu();
  const chunks = [];
  const t0 = performance.now();
  const progress = [];
  const sampler = sampleGpu();
  let result;
  let gpu;
  try {
    result = await aiRepaint({
      engine,
      models: MODELS,
      photo: PHOTO,
      outPath: join(OUT, `${name}.png`),
      unlockedPath: join(OUT, `${name}-unlocked.png`),
      renderPath: join(OUT, `${name}-render.png`),
      logPath: join(OUT, `${name}.sd.log`),
      onOutput: (stream, text) => chunks.push({ stream, ms: Math.round(performance.now() - t0), text }),
      onProgress: (p) => progress.push(p),
      ...opts,
    });
  } finally {
    gpu = sampler.stop();
  }
  const wallMs = Math.round(performance.now() - t0);
  const fractions = progress.map((p) => p.fraction);
  const summary = { name, wallMs, gpu: { ...gpu, freeBefore, peakAboveBaseline: gpu.peak - gpu.baseline }, ...result, progressEvents: progress.length };
  await writeFile(join(OUT, `${name}.json`), JSON.stringify(summary, null, 2));
  console.log(`[real] ${name}`, JSON.stringify({ wallMs, gpu: summary.gpu, deltaE: result.deltaE, deltaEUnlocked: result.deltaEUnlocked, timings: result.timings, surfaces: result.surfaces }));
  return { result, chunks, fractions, summary };
}

describe.runIf(real)("real sd-cli run (HP_REAL_SD=1)", () => {
  test(
    "house1 body → Positive Red #ad2c34",
    async () => {
      const { result, chunks, fractions } = await run("house1-body-positive-red", {
        mask: BODY,
        colorHex: "#ad2c34",
        colorName: "Positive Red",
        surfaceLabel: "siding",
      });
      await writeFile(join(HERE, "fixtures", "sdcli-house1-red.chunks.json"), JSON.stringify(chunks, null, 1));
      expect(result.deltaE).toBeLessThan(2);
      expect(fractions.at(-1)).toBe(1);
      for (let i = 1; i < fractions.length; i++) expect(fractions[i]).toBeGreaterThanOrEqual(fractions[i - 1]);
      const check = await outsideIdentical(result.path, [BODY]);
      expect(check.size).toEqual(check.photoSize);
      expect(check.outside).toBeGreaterThan(0);
      expect(check.differ).toBe(0);
    },
    10 * 60_000,
  );

  test(
    "three surfaces at once: siding Positive Red, shutters Naval, garage door Evergreen Fog",
    async () => {
      const masks = [BODY, `${PROBE}/out/r2/house1-shutter.png`, `${PROBE}/out/r2/house1-garage-door.png`];
      const { result } = await run("house1-three-surfaces", {
        surfaces: [
          { mask: masks[0], colorHex: "#ad2c34", colorName: "Positive Red", surfaceLabel: "siding" },
          { mask: masks[1], colorHex: "#2f3d4c", colorName: "Naval", surfaceLabel: "shutters" },
          { mask: masks[2], colorHex: "#95978a", colorName: "Evergreen Fog", surfaceLabel: "garage door" },
        ],
      });
      expect(result.surfaces).toHaveLength(3);
      for (const s of result.surfaces) expect(s.deltaE).toBeLessThan(2);
      const check = await outsideIdentical(result.path, masks);
      expect(check.differ).toBe(0);
    },
    10 * 60_000,
  );

  test(
    "cancel after the first sampling step kills sd-cli and frees the GPU",
    async () => {
      const engine = await ensureEngine(join(OUT, "engine"), { download: localCopy, gpu: { cuda: true } });
      const free0 = await waitForGpu();
      const ac = new AbortController();
      let usedAtAbort = null;
      const t0 = performance.now();
      const run = aiRepaint({
        engine,
        models: MODELS,
        photo: PHOTO,
        mask: BODY,
        colorHex: "#ad2c34",
        surfaceLabel: "siding",
        outPath: join(OUT, "cancelled.png"),
        signal: ac.signal,
        onProgress: (p) => {
          if (p.step === 1 && !ac.signal.aborted) {
            ac.abort();
            gpuMiB("memory.used").then((v) => {
              usedAtAbort = v;
            });
          }
        },
      });
      await expect(run).rejects.toMatchObject({ name: "AbortError" });
      const abortedAfterMs = Math.round(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 1500));
      const freeAfter = await gpuMiB("memory.free");
      const tasks = await nvidiaSmi(["--query-compute-apps=pid,process_name", "--format=csv,noheader"]);
      const summary = { abortedAfterMs, freeBefore: free0, usedAtAbort, freeAfter, sdCliStillListed: /sd-cli/i.test(tasks) };
      await writeFile(join(OUT, "cancel.json"), JSON.stringify(summary, null, 2));
      console.log("[real] cancel", JSON.stringify(summary));
      expect(/sd-cli/i.test(tasks)).toBe(false);
      expect(freeAfter).toBeGreaterThan(free0 - 300);
      expect(existsSync(join(OUT, "cancelled.png"))).toBe(false);
    },
    10 * 60_000,
  );

  test.runIf(process.platform === "win32")(
    "a data folder with non-ASCII characters (engine, weights, photo, work files, output)",
    async () => {
      // A user profile like C:\Users\José\…: everything sd-cli opens or writes sits under it.
      // The weights are reached through a junction (no 8 GB copy).
      const root = join(OUT, "Dâta Jösé ü");
      await mkdir(root, { recursive: true });
      const models = join(root, "modèles");
      if (!existsSync(models)) symlinkSync(`${PROBE}/models/flux2-klein`, models, "junction");
      await copyFile(PHOTO, join(root, "maison.jpg"));
      await copyFile(BODY, join(root, "façade.png"));
      const engine = await ensureEngine(join(root, "moteur"), { download: localCopy, gpu: { cuda: true } });
      await waitForGpu();
      let result;
      try {
        result = await aiRepaint({
        engine,
        models: { diffusion: join(models, "flux-2-klein-4b-Q8_0.gguf"), llm: join(models, "Qwen3-4B-Q8_0.gguf"), vae: join(models, "flux2-klein-vae.safetensors") },
        photo: join(root, "maison.jpg"),
        mask: join(root, "façade.png"),
        colorHex: "#ad2c34",
        colorName: "Rouge Positif é",
        surfaceLabel: "bardage",
        outPath: join(root, "résultat.png"),
        workDir: root,
        });
      } finally {
        rmdirSync(models); // the junction only (non-recursive) — never the weights behind it
      }
      expect(existsSync(`${PROBE}/models/flux2-klein/flux2-klein-vae.safetensors`)).toBe(true);
      await writeFile(join(OUT, "non-ascii.json"), JSON.stringify(result, null, 2));
      expect(existsSync(join(root, "résultat.png"))).toBe(true);
      expect(result.deltaE).toBeLessThan(2);
    },
    10 * 60_000,
  );

  test.runIf(process.env.HP_REAL_SD_1MP === "1")(
    "house1 body at ~1 MP (1184×880)",
    async () => {
      const { result } = await run("house1-body-positive-red-1mp", {
        mask: BODY,
        colorHex: "#ad2c34",
        colorName: "Positive Red",
        surfaceLabel: "siding",
        size: { width: 1184, height: 880 },
      });
      expect(result.deltaE).toBeLessThan(2);
    },
    10 * 60_000,
  );
});
