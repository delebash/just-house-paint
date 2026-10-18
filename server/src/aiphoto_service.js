// SPDX-License-Identifier: MIT
// The AI photo (PRD F8, an option button): stable-diffusion.cpp + FLUX.2 [klein] 4B repaint the
// chosen parts inside their outlines, then the photo is pasted back and the paint locked
// (aiphoto/). This service owns what the routes need: whether the engine and models are here,
// installing them (a job), and one render — which first frees the GPU (the part finder's image
// session and the local AI model), because sd.cpp doesn't wait for memory (RESEARCH §10).

import { existsSync, readdirSync } from "node:fs";
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
  const engineHere = () => {
    if (!existsSync(ctx.engineDir)) return false;
    for (const tag of readdirSync(ctx.engineDir)) {
      const tagDir = path.join(ctx.engineDir, tag);
      if (tag.startsWith(".") || !existsSync(tagDir)) continue;
      for (const backend of readdirSync(tagDir)) if (existsSync(path.join(tagDir, backend, ".aiphoto-engine.json"))) return true;
    }
    return false;
  };

  return {
    async status() {
      const gpu = await ctx.detectGpu();
      const row = selectEngineAsset(ENGINE_RELEASES.pinned, { platform: process.platform, arch: process.arch, gpu });
      const downloadBytes = (row ? row.asset.size + (row.runtime?.size || 0) : 0) + Object.values(MODEL_FILES).reduce((n, m) => n + m.size, 0);
      return {
        engineInstalled: engineHere(),
        modelsInstalled: modelsHere(),
        backend: row?.backend ?? null,
        // a CPU-only edit takes ~10 minutes (RESEARCH §9) — the screen says so before installing
        slow: !row || row.backend === "cpu",
        downloadBytes,
      };
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
     * One AI photo of `house` with `surfaces`: [{ key, hex, name }] (paintable parts with a paint).
     * Returns { file, deltaE, seconds, engine }.
     */
    async render(house, surfaces, { renderId, signal, progress }) {
      if (!surfaces.length) throw new ApiError(422, "nothing-to-paint", "Pick colors first", "give at least one part a paint color");
      if (!engineHere() || !modelsHere()) {
        throw new ApiError(409, "aiphoto-not-installed", "The AI photo isn't installed", "install it first (the engine and about 9 GB of models)");
      }
      progress(0.02, "freeing the GPU");
      await ctx.finder.releaseGpu();
      await ctx.stopLocalModel();
      const gpu = await ctx.detectGpu();
      const engine = await ensureEngine(ctx.engineDir, { gpu, download: () => Promise.reject(new Error("not installed")) });
      const models = await ensureModels(ctx.modelDir, { download: () => Promise.reject(new Error("not installed")) });
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
