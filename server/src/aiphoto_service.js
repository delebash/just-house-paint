// SPDX-License-Identifier: MIT
// The AI photo (PRD F8, an option button): stable-diffusion.cpp + FLUX.2 [klein] 4B repaint the
// chosen parts inside their outlines, then the photo is pasted back and the paint locked
// (aiphoto/). This service owns what the routes need: whether the engine and models are here,
// what this computer lacks to run them (said before the download), installing them (a job), and
// one render — which first frees the GPU (the part finder's image session and the local AI
// model), because sd.cpp doesn't wait for memory (RESEARCH §10).

import { existsSync, mkdirSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ApiError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import * as hardware from "@delebash/core/runner/hardware";
import { aiRepaint as realRepaint } from "./aiphoto/edit.js";
import { ENGINE_RELEASES, engineFiles, ensureEngine as realEnsureEngine, ensureModels as realEnsureModels, MODEL_FILES, selectEngineAsset } from "./aiphoto/engine.js";
import { SdCliError } from "./aiphoto/sdcli.js";
import { maskPath, originalPath, renderPath } from "./files.js";

const log = getLogger("just_house_paint.aiphoto");

/** A part key in the English the model reads ("garageDoor" → "garage door") — prompts stay English
 * (RESEARCH §10: French labels barely changed the color). */
export const surfaceWords = (key) => WORDS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
// the parts whose key alone reads wrong to the model
const WORDS = { decor: "wall decorations" };

/**
 * The memory one AI photo takes, as the computer's RAM is sold (the kit's snapRamGb: 8, 12, 16 GB …):
 * sd-cli held ~7.4 GB of the computer's own memory beside 5.96 GB on the card (RESEARCH §12), plus
 * the system and the app — `discrete`; where the graphics memory IS the computer's (the CPU build, an
 * integrated GPU, a Mac) both come out of it — `shared`. Under it the screen says so before the download.
 */
export const RAM_NEED_GB = Object.freeze({ discrete: 12, shared: 16 });

/**
 * What this computer lacks to run `row` (an install row of engine.js — its `requires`), or null:
 * { reason, …, detail } — `reason` a slug the screen words ("no-build", "vc-runtime", "macos",
 * "glibc"), `detail` the server's English. `sys`: { platform, arch, versions, missingDlls(names) }.
 */
export function unmetNeed(row, sys) {
  if (!row) {
    return { reason: "no-build", detail: `stable-diffusion.cpp publishes no build for ${sys.platform}/${sys.arch}` };
  }
  const req = row.requires || {};
  if (req.dlls?.length) {
    const missing = sys.missingDlls(req.dlls);
    if (missing.length) {
      return {
        reason: "vc-runtime",
        missing,
        url: hardware.VC_REDIST_URL,
        detail: `Microsoft's Visual C++ runtime (2015–2022) isn't on this computer (${missing.join(", ")} missing) — install it from ${hardware.VC_REDIST_URL}, then try again`,
      };
    }
  }
  if (req.macos && !hardware.versionAtLeast(sys.versions.macos, req.macos)) {
    const have = sys.versions.macos;
    return { reason: "macos", need: req.macos, have, detail: `the AI photo's engine needs macOS ${req.macos} or later; this Mac has ${have ? `macOS ${have}` : "an older macOS"}` };
  }
  if (req.glibc && !hardware.versionAtLeast(sys.versions.glibc, req.glibc)) {
    const have = sys.versions.glibc;
    return {
      reason: "glibc",
      need: req.glibc,
      have,
      detail: `the AI photo's engine needs a Linux with glibc ${req.glibc} or later (Ubuntu 24.04 and newer); this one has ${have ? `glibc ${have}` : "no glibc"}`,
    };
  }
  return null;
}

/** The note when this computer has less memory than the AI photo takes: { needGb, haveGb } or null.
 *  `hw` the kit's hardware detection (memArch tells a card's own memory from the computer's). */
export function memoryNote(row, hw, totalBytes) {
  if (!row || !totalBytes) return null;
  let shared = row.backend === "cpu" || row.backend === "metal";
  try {
    shared ||= hardware.memArch(hw || {}) !== "discrete";
  } catch {
    shared = true;
  }
  const needGb = shared ? RAM_NEED_GB.shared : RAM_NEED_GB.discrete;
  const haveGb = hardware.snapRamGb(totalBytes / 1024 ** 2);
  return haveGb < needGb ? { needGb, haveGb } : null;
}

/**
 * `ctx`: { dataDir, engineDir, modelDir, finder (releaseGpu), stopLocalModel() → frees the kit's
 * local AI model, detectGpu() → the kit's hardware detection, settings: { templates(),
 * compose(), workingSize() } } — plus `aiRepaint`, `ensureEngine`, `ensureModels`, `system`
 * ({ platform, arch, versions, missingDlls }), `totalMem()` (tests swap them).
 */
export function createAiPhoto(ctx) {
  const aiRepaint = ctx.aiRepaint || realRepaint;
  const ensureEngine = ctx.ensureEngine || realEnsureEngine;
  const ensureModels = ctx.ensureModels || realEnsureModels;
  const totalMem = ctx.totalMem || (() => os.totalmem());
  // what the engine's builds need from this system (the kit's probes; read on each status — installing the
  // Visual C++ runtime or updating the system needs no restart to be seen)
  const system = () =>
    ctx.system?.() ?? {
      platform: process.platform,
      arch: process.arch,
      versions: hardware.systemVersions(),
      missingDlls: (names, opts) => hardware.missingDlls(names, opts),
    };
  const modelsHere = () => Object.values(MODEL_FILES).every((m) => existsSync(path.join(ctx.modelDir, m.file)));
  // the engine the render uses is here: the pinned release, for the backend this computer's graphics
  // card picks (an older release, or another backend's, doesn't count — the render would refuse it)
  const engineRow = (gpu) => selectEngineAsset(ENGINE_RELEASES.pinned, { platform: process.platform, arch: process.arch, gpu });
  const engineHome = (row) => path.join(ctx.engineDir, row.tag, row.backend);
  // whole: the marker, sd-cli and every file the release unpacked (an antivirus may take one and leave the marker)
  const engineState = (row) => (row ? engineFiles(engineHome(row), row.exe) : { installed: false, missing: [] });

  /** sd-cli that couldn't start, in words: why (the exit code Windows gave), and what to do. */
  function cantStart(e, row, bin) {
    const title = "The AI photo's engine couldn't start";
    const vc = hardware.VC_REDIST_URL;
    if (e.reason === "exe-missing" || e.reason === "dll-missing") {
      const runtimeMissing = row?.requires?.dlls?.length ? system().missingDlls(row.requires.dlls, { appDir: path.dirname(bin) }) : [];
      if (runtimeMissing.length) {
        return new ApiError(503, "vc-runtime-missing", title, `Microsoft's Visual C++ runtime (2015–2022) isn't on this computer (${runtimeMissing.join(", ")} missing) — install it from ${vc}, then try again`, {
          reason: "vc-runtime",
        });
      }
      const gone = row ? engineState(row).missing : [];
      if (gone.length || e.reason === "exe-missing") {
        const names = gone.length ? gone.join(", ") : path.basename(bin);
        return new ApiError(503, "engine-files-missing", title, `files of the AI photo's engine are missing (${names}) — an antivirus may have removed them: install the AI photo again`, {
          reason: "files-missing",
        });
      }
      return new ApiError(503, "dll-missing", title, `a DLL it needs couldn't be found (${e.message}) — an antivirus may have removed one of its files: install the AI photo again; if it still fails, install Microsoft's Visual C++ runtime from ${vc}`, {
        reason: "dll-missing",
      });
    }
    if (e.reason === "dll-too-old") {
      return new ApiError(503, "dll-too-old", title, `a DLL on this computer is older than the engine needs (${e.message}) — install the latest Microsoft Visual C++ runtime from ${vc}, then try again`, {
        reason: "dll-too-old",
      });
    }
    return new ApiError(503, "path-too-long", title, `a path is too long for the engine (${e.message}) — move the app's data folder to a shorter path`, { reason: "path-too-long" });
  }

  return {
    async status() {
      const gpu = await ctx.detectGpu();
      const row = engineRow(gpu);
      const engine = engineState(row);
      // what Install still downloads: the engine unless it is here, and the models not here at full size
      const engineBytes = row && !engine.installed ? row.asset.size + (row.runtime?.size || 0) : 0;
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
      const sys = system();
      const need = unmetNeed(row, sys);
      return {
        engineInstalled: engine.installed,
        // installed once, files of it gone since (an antivirus): Install puts them back
        engineMissing: engine.missing,
        modelsInstalled: modelsHere(),
        backend: row?.backend ?? null,
        // a stable-diffusion.cpp build exists for this system and processor, and this computer has what it needs
        available: !need,
        // what it lacks, said before the download: null, or { reason, …, detail }
        need,
        // only the CUDA build was measured fast (~20 s); the CPU build takes ~10 minutes (RESEARCH §9), and an
        // integrated GPU's Vulkan build is unmeasured — the screen says so before installing
        slow: row?.backend !== "cuda12",
        // less memory than one AI photo takes: { needGb, haveGb } or null
        lowMemory: memoryNote(row, gpu, totalMem()),
        downloadBytes,
        // the most the install holds on the drive at once: the engine unpacked, beside its zips (removed once
        // unpacked) or the models downloaded after them, whichever is bigger
        diskBytes: (row && !engine.installed ? row.asset.unpacked + (row.runtime?.unpacked || 0) : 0) + Math.max(engineBytes, modelBytes),
      };
    },

    /** Remove the engine and the models (Settings → Storage); no render runs (the route checks). */
    async uninstall() {
      // async, with Node's retries: a held file never stalls the server
      for (const dir of [ctx.modelDir, ctx.engineDir]) await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
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
      const row = engineRow(gpu);
      const engineNow = engineState(row);
      if (engineNow.missing.length) {
        throw new ApiError(409, "aiphoto-files-missing", "The AI photo's engine is missing files", `${engineNow.missing.join(", ")} — an antivirus may have removed them: install the AI photo again`);
      }
      if (!engineNow.installed || !modelsHere()) {
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
      // a backup keeps no empty folder: a house restored before its first AI photo has no renders folder
      mkdirSync(path.dirname(out), { recursive: true });
      let result;
      try {
        result = await aiRepaint({
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
          maxPixels: ctx.settings.fullSizeMaxPixels?.() ?? null,
          size: ctx.settings.workingSize(),
          compose: ctx.settings.compose(),
          templates: ctx.settings.templates(),
          signal,
          onProgress: (e) => progress(0.05 + 0.95 * (e.fraction ?? 0), e.stage),
        });
      } catch (e) {
        // Windows' exit code for a program its loader couldn't start ("exit 3221225781") said in words
        if (e instanceof SdCliError && e.reason) {
          log.warning(`sd-cli couldn't start: ${e.message}`);
          throw cantStart(e, row, engine);
        }
        throw e;
      }
      const seconds = (Date.now() - t0) / 1000;
      log.info(`AI photo of ${house.id}: ${seconds.toFixed(1)} s, ΔE ${result.deltaE}`);
      return { file: path.basename(out), deltaE: result.deltaE, seconds, engine: "sd.cpp FLUX.2 klein 4B" };
    },
  };
}

/** The other programs' graphics memory (the kit's otherGpuHolders rows: { label, memMb }, biggest
 *  first) worth naming under an AI photo: { mb, programs, more } — the biggest three named, `more`
 *  the others counted in `mb` — when together they hold more than `floorMb`, else null (none, under
 *  it, unmeasurable, or the note turned off). */
export function sharedGpuNote(rows, floorMb) {
  if (!floorMb || !rows?.length) return null;
  const mb = rows.reduce((n, r) => n + r.memMb, 0);
  return mb > floorMb ? { mb, programs: rows.slice(0, 3).map((r) => r.label), more: Math.max(0, rows.length - 3) } : null;
}
