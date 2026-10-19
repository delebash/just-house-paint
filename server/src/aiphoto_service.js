// SPDX-License-Identifier: MIT
// The AI photo (PRD F8, an option button): stable-diffusion.cpp + FLUX.2 [klein] 4B repaint the
// chosen parts inside their outlines, then the photo is pasted back and the paint locked
// (aiphoto/). This service owns what the routes need: whether the engine and models are here,
// installing them (a job), and one render — which first frees the GPU (the part finder's image
// session and the local AI model), because sd.cpp doesn't wait for memory (RESEARCH §10).

import { existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { ApiError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { aiRepaint as realRepaint } from "./aiphoto/edit.js";
import { ENGINE_RELEASES, ensureEngine as realEnsureEngine, ensureModels as realEnsureModels, MODEL_FILES, selectEngineAsset } from "./aiphoto/engine.js";
import { maskPath, originalPath, renderPath } from "./files.js";

const log = getLogger("just_house_paint.aiphoto");

/** A part key in the English the model reads ("garageDoor" → "garage door") — prompts stay English
 * (RESEARCH §10: French labels barely changed the color). */
export const surfaceWords = (key) => key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

/**
 * `ctx`: { dataDir, engineDir, modelDir, finder (releaseGpu), stopLocalModel() → frees the kit's
 * local AI model, detectGpu() → the kit's hardware detection, settings: { templates(),
 * compose(), workingSize() } } — plus `aiRepaint`, `ensureEngine`, `ensureModels` (tests swap them).
 */
export function createAiPhoto(ctx) {
  const aiRepaint = ctx.aiRepaint || realRepaint;
  const ensureEngine = ctx.ensureEngine || realEnsureEngine;
  const ensureModels = ctx.ensureModels || realEnsureModels;
  const modelsHere = () => Object.values(MODEL_FILES).every((m) => existsSync(path.join(ctx.modelDir, m.file)));
  // the engine the render uses is here: the pinned release, for the backend this computer's graphics
  // card picks (an older release, or another backend's, doesn't count — the render would refuse it)
  const engineRow = (gpu) => selectEngineAsset(ENGINE_RELEASES.pinned, { platform: process.platform, arch: process.arch, gpu });
  const engineHere = (row) => !!row && existsSync(path.join(ctx.engineDir, row.tag, row.backend, ".aiphoto-engine.json"));

  return {
    async status() {
      const row = engineRow(await ctx.detectGpu());
      // what Install still downloads: the engine unless it is here, and the models not here at full size
      const engineBytes = row && !engineHere(row) ? row.asset.size + (row.runtime?.size || 0) : 0;
      const modelBytes = Object.values(MODEL_FILES)
        .filter((m) => {
          try {
            return statSync(path.join(ctx.modelDir, m.file)).size !== m.size;
          } catch {
            return true;
          }
        })
        .reduce((n, m) => n + m.size, 0);
      const downloadBytes = engineBytes + modelBytes;
      return {
        engineInstalled: engineHere(row),
        modelsInstalled: modelsHere(),
        backend: row?.backend ?? null,
        // a CPU-only edit takes ~10 minutes (RESEARCH §9) — the screen says so before installing
        slow: !row || row.backend === "cpu",
        downloadBytes,
      };
    },

    /** Remove the engine and the models (Settings → Storage); no render runs (the route checks). */
    async uninstall() {
      for (const dir of [ctx.modelDir, ctx.engineDir]) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },

    /** Install the engine and the models (a job); `download` is the kit's streamDownload. */
    async install({ download, progress, signal }) {
      const cancelCheck = () => signal?.aborted;
      const gpu = await ctx.detectGpu();
      await ensureEngine(ctx.engineDir, { download, gpu, cancelCheck, onProgress: (e) => progress(0.25 * (e.fraction ?? 0), `engine: ${e.stage}`) });
      await ensureModels(ctx.modelDir, { download, cancelCheck, onProgress: (e) => progress(0.25 + 0.75 * (e.fraction ?? 0), `models: ${e.file || e.stage}`) });
      return { installed: true };
    },

    /**
     * One AI photo of `house` with `surfaces`: [{ key, hex, name, currentHex? }] (paintable parts with
     * a paint; `currentHex` the paint the part has now, when its owner said).
     * Returns { file, deltaE, seconds, engine }.
     */
    async render(house, surfaces, { renderId, signal, progress }) {
      if (!surfaces.length) throw new ApiError(422, "nothing-to-paint", "Pick colors first", "give at least one part a paint color");
      const gpu = await ctx.detectGpu();
      if (!engineHere(engineRow(gpu)) || !modelsHere()) {
        throw new ApiError(409, "aiphoto-not-installed", "The AI photo isn't installed", "install it first (the engine and about 9 GB of models)");
      }
      progress(0.02, "freeing the GPU");
      await ctx.finder.releaseGpu();
      await ctx.stopLocalModel();
      const engine = await ensureEngine(ctx.engineDir, { gpu, download: () => Promise.reject(new Error("not installed")) });
      // checking the models (hashing ~9 GB when they carry no manifest) shows and can be cancelled
      const models = await ensureModels(ctx.modelDir, {
        download: () => Promise.reject(new Error("not installed")),
        cancelCheck: () => signal?.aborted,
        onProgress: (e) => progress(0.02 + 0.03 * (e.fraction ?? 0), "checking the models"),
      });
      signal?.throwIfAborted();
      const t0 = Date.now();
      const out = renderPath(ctx.dataDir, house.id, renderId);
      const result = await aiRepaint({
        engine,
        models,
        photo: originalPath(ctx.dataDir, house.id, house.originalFile),
        surfaces: surfaces.map((s) => ({
          mask: maskPath(ctx.dataDir, house.id, s.key),
          colorHex: s.hex,
          colorName: s.name,
          currentHex: s.currentHex ?? null,
          surfaceLabel: surfaceWords(s.key),
        })),
        outPath: out,
        size: ctx.settings.workingSize(),
        compose: ctx.settings.compose(),
        templates: ctx.settings.templates(),
        signal,
        onProgress: (e) => progress(0.05 + 0.95 * (e.fraction ?? 0), e.stage),
      });
      const seconds = (Date.now() - t0) / 1000;
      log.info(`AI photo of ${house.id}: ${seconds.toFixed(1)} s, ΔE ${result.deltaE}`);
      return { file: path.basename(out), deltaE: result.deltaE, seconds, engine: "sd.cpp FLUX.2 klein 4B" };
    },
  };
}
