// SPDX-License-Identifier: MIT
// The real end-to-end run through the kit — gated: it needs the GPU, the kit's sd.cpp build installed and FLUX.2
// [klein]'s files in the kit's models cache (the AI page's Images tab, or the house page's banner, puts them there),
// and takes ~20 s per edit.
//
//   HP_REAL_SD=1 HP_REAL_CACHE=<the kit's cache folder> npm run test:server -- tests/aiphoto/real.test.js
//
// The kit's sd.cpp runtime runs the AI photo's model with its preset's recipe (seed_presets.js p_aiphoto), exactly as
// the app does (aiphoto_service.js → the kit's runImageFeature → imageEdit); before each run it waits until the GPU
// has HP_MIN_FREE_MIB (7000) that no other program holds — another app may hold it (the kit's otherGpuHolders: its
// own sd-server, kept running between drawings, is this test's). Photos and masks are read from the probe folder
// (data/probe/, gitignored); everything written goes under the system's temp folder (HP_REAL_OUT), never the data
// folder. HP_REAL_SD_1MP=1 adds a ~1 MP run for the size/VRAM trade-off.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { binaryAsset, DEFAULT_SDCPP_BINARIES, DEFAULT_SDCPP_BUILD } from "@delebash/core/runner/config";
import * as hardware from "@delebash/core/runner/hardware";
import { RuntimeService } from "@delebash/core/runner/runtime_service";
import { imageEdit, SDCPP_SERVER } from "@delebash/core/runner/sdcpp";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { aiRepaint } from "../../src/aiphoto/edit.js";
import { DEFAULT_COMPOSE, featherMask, readMask, readRgb } from "../../src/aiphoto/pixels.js";
import { DEFAULT_ENGINE_PRESETS, FLUX2_KLEIN } from "../../src/seed_presets.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = process.env.HP_REAL_SD === "1";
const CACHE = process.env.HP_REAL_CACHE || "";
// the probe folder in this checkout's data folder (gitignored): its photos and masks — read only
const PROBE = process.env.HP_PROBE_DIR || join(HERE, "..", "..", "..", "data", "probe");
const OUT = process.env.HP_REAL_OUT || join(tmpdir(), "hp-aiphoto-real");
const MIN_FREE_MIB = Number(process.env.HP_MIN_FREE_MIB || 7000);
const PHOTO = `${PROBE}/photos/house1-white-shutters.jpg`;
const BODY = `${PROBE}/out/r2/house1-body.png`;
const RECIPE = DEFAULT_ENGINE_PRESETS.find((p) => p.id === "p_aiphoto").params;

/** The kit's sd.cpp runtime on the cache that holds the build and the model (as installLlm makes it). */
const svc = real
  ? new RuntimeService({
      id: "sdcpp",
      cacheRoot: CACHE,
      configFn: () => ({
        pinnedBuild: DEFAULT_SDCPP_BUILD,
        binaries: DEFAULT_SDCPP_BINARIES.map((b) => ({ ...binaryAsset(b), assetBytes: b.asset_bytes, runtimeBytes: b.runtime_bytes ?? 0, requires: b.requires })),
        idleSeconds: 0,
      }),
      modelsFn: () => [FLUX2_KLEIN],
      server: SDCPP_SERVER,
      logDir: OUT,
    })
  : null;
/** The AI photo's drawing, the way the app runs it — its preset's recipe on the kit's runtime. */
const generate = (request, opts) => imageEdit(svc, { model: svc.modelFor(FLUX2_KLEIN.id), request: { ...request, params: RECIPE }, ...opts });

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

/** Wait (up to 20 min) until the GPU has `min` MiB no other program holds; returns the MiB seen. Other programs are
 *  the kit's otherGpuHolders — outside this process's tree, so the test's own sd-server (the kit keeps it running
 *  between drawings) is its own room; where that can't be measured, the card's free memory. */
async function waitForGpu(min = MIN_FREE_MIB) {
  const total = await gpuMiB("memory.total");
  const until = Date.now() + 20 * 60_000;
  for (;;) {
    const others = await hardware.otherGpuHolders().catch(() => null);
    const room = others ? total - others.reduce((n, r) => n + r.memMb, 0) : await gpuMiB("memory.free");
    if (room >= min) return room;
    const who = others?.length ? ` (${others.map((r) => `${r.label} ${r.memMb} MB`).join(", ")})` : "";
    if (Date.now() > until) throw new Error(`the GPU still has only ${room} MiB other programs leave${who}`);
    console.log(`[real] GPU ${room} MiB left by other programs < ${min}${who} — waiting`);
    await new Promise((r) => setTimeout(r, 15_000));
  }
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
  const freeBefore = await waitForGpu();
  const t0 = performance.now();
  const progress = [];
  const result = await aiRepaint({
    generate,
    photo: PHOTO,
    outPath: join(OUT, `${name}.png`),
    unlockedPath: join(OUT, `${name}-unlocked.png`),
    renderPath: join(OUT, `${name}-render.png`),
    onProgress: (p) => progress.push(p),
    ...opts,
  });
  const wallMs = Math.round(performance.now() - t0);
  const fractions = progress.map((p) => p.fraction);
  const summary = { name, wallMs, freeBefore, ...result, progressEvents: progress.length };
  await writeFile(join(OUT, `${name}.json`), JSON.stringify(summary, null, 2));
  console.log(`[real] ${name}`, JSON.stringify({ wallMs, deltaE: result.deltaE, deltaEUnlocked: result.deltaEUnlocked, timings: result.timings, surfaces: result.surfaces }));
  return { result, fractions };
}

describe.runIf(real)("the AI photo for real, on the kit's sd.cpp runtime (HP_REAL_SD=1)", () => {
  // the kit's hardware detection, as the app's boot runs it (installLlm): the runtime picks its build from it
  beforeAll(() => hardware.ensureDetected(), 120_000);
  afterAll(async () => {
    await svc?.stopServer();
  });

  test("the kit's cache holds the pinned build and FLUX.2 [klein]'s files", () => {
    expect(CACHE, "set HP_REAL_CACHE to the kit's cache folder").not.toBe("");
    expect(svc.status(), "install the engine on the AI page's Images tab first").toMatchObject({ installed: true });
    expect(svc.modelsStatus()[0], "download the model on the AI page's Images tab first").toMatchObject({ id: FLUX2_KLEIN.id, onDisk: true });
  });

  test(
    "house1 body → Positive Red #ad2c34",
    async () => {
      const { result, fractions } = await run("house1-body-positive-red", {
        mask: BODY,
        colorHex: "#ad2c34",
        colorName: "Positive Red",
        surfaceLabel: "siding",
      });
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
    "cancel after the first step stops the drawing mid-render (sd-server cancels the job — master-1004)",
    async () => {
      await waitForGpu();
      const ac = new AbortController();
      const t0 = performance.now();
      const out = join(OUT, "cancelled.png");
      const drawing = aiRepaint({
        generate,
        photo: PHOTO,
        mask: BODY,
        colorHex: "#ad2c34",
        surfaceLabel: "siding",
        outPath: out,
        signal: ac.signal,
        onProgress: (p) => {
          if (p.step === 1 && !ac.signal.aborted) ac.abort();
        },
      });
      await expect(drawing).rejects.toMatchObject({ name: "AbortError" });
      const abortedAfterMs = Math.round(performance.now() - t0);
      await writeFile(join(OUT, "cancel.json"), JSON.stringify({ abortedAfterMs }, null, 2));
      console.log("[real] cancel", JSON.stringify({ abortedAfterMs }));
      expect(existsSync(out)).toBe(false);
    },
    10 * 60_000,
  );

  test.runIf(process.platform === "win32")(
    "a data folder with non-ASCII characters (photo, mask, work files, output)",
    async () => {
      // A user profile like C:\Users\José\…: the app's own files sit under it (the kit's cache holds the weights).
      const root = join(OUT, "Dâta Jösé ü");
      await mkdir(root, { recursive: true });
      await copyFile(PHOTO, join(root, "maison.jpg"));
      await copyFile(BODY, join(root, "façade.png"));
      await waitForGpu();
      const result = await aiRepaint({
        generate,
        photo: join(root, "maison.jpg"),
        mask: join(root, "façade.png"),
        colorHex: "#ad2c34",
        // the paths are what this case is about; the prompt's words stay English, as the app's are (surfaceWords —
        // French labels left the color barely changed, RESEARCH §10)
        colorName: "Positive Red",
        surfaceLabel: "siding",
        outPath: join(root, "résultat.png"),
        workDir: root,
      });
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
