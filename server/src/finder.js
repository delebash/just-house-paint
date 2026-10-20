// SPDX-License-Identifier: MIT
// The part finder the routes use (parts_api.js): SAM 3 (segment/) on a house's display photo.
//   - find(house) — every part of the recipe, each pixel given to ONE part: where parts overlap
//     (the "door" prompt also takes the garage door; "trim" the gutters — RESEARCH §10) the
//     earlier part of the priority list wins. The recipe and the priority are settings rows.
//   - box(house, box) — what is inside a box the user drew (SAM 3's decoder takes boxes, not
//     points: a garage-door box scored 0.983 — RESEARCH §10).
// The encoded photo is kept for the next box on the same house. The image encoder holds ~5.7 GB
// of GPU memory on DirectML, so the segmenter is released when it has been idle a while and
// before the AI photo runs (releaseGpu).

import { existsSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { ApiError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import * as hardware from "@delebash/core/runner/hardware";
import { displayPath } from "./files.js";
import { ensureModels, MODEL_FILES } from "./segment/models.js";
import { DEFAULT_PARTS, findParts, validatePartsConfig } from "./segment/parts.js";

const log = getLogger("just_house_paint.finder");

/** Where parts overlap, the earlier key wins (the specific before the general; the body last). */
export const DEFAULT_PART_PRIORITY = Object.freeze([
  "windows",
  "garageDoor",
  "frontDoor",
  "shutters",
  "lamps",
  "gutters",
  // before the roof and the trim: the overhang's boards are the soffit's, not the roof's edge
  "soffit",
  // after the windows (they keep the glass), before the trim (it keeps the casings)
  "windowTrim",
  "railings",
  "columns",
  "chimney",
  "stone",
  "brick",
  "roof",
  "trim",
  // last but the body: an ornament takes only the wall it sits on, never a part found around it
  "decor",
  "body",
]);

/** The image encoder on the GPU when it can (DirectML), the rest on the CPU — the measured best
 * (RESEARCH §10: 1.44 s encode; the language encoder and decoder are faster on the CPU). */
export const DEFAULT_PROVIDERS = Object.freeze({ image: "auto", language: "cpu", decoder: "cpu" });

/**
 * The DirectML device the image encoder takes: the adapter with the most memory of its own (the kit's
 * dxgiAdapters, DirectX's order — ONNX Runtime's DirectML `deviceId` is that index,
 * onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html). Adapter 0 drives the main
 * display — on a laptop often the integrated GPU, beside an NVIDIA card it never used (2026-10-20, the
 * thirteenth review). The software adapter never; a tie keeps the earlier; undefined when none
 * (DirectML's own default, adapter 0).
 */
export function bestDmlAdapter(adapters) {
  let best;
  for (const a of adapters || []) if (!a.software && (best === undefined || a.dedicatedMb > best.dedicatedMb)) best = a;
  return best?.index;
}

/** The Visual C++ runtime's DLLs onnxruntime.dll and its Node binding import (their import tables,
 *  onnxruntime-node 1.30, read 2026-10-20) — MSVCP140_1 and MSVCP140_ATOMIC_WAIT come only with a
 *  2019-or-later runtime, so an older one installed is found missing too. */
export const ORT_VC_DLLS = Object.freeze(["MSVCP140.dll", "MSVCP140_1.dll", "MSVCP140_ATOMIC_WAIT.dll", "VCRUNTIME140.dll", "VCRUNTIME140_1.dll"]);

/** Where onnxruntime-node keeps this computer's native files (its binding loads them from there). */
function ortBinDir() {
  try {
    const pkg = createRequire(import.meta.url).resolve("onnxruntime-node/package.json");
    return path.join(path.dirname(pkg), "bin", "napi-v6", process.platform, process.arch);
  } catch {
    return null;
  }
}

/** The finder's runtime not loading here, in words (the status, Install's refusal, a Find): `reason` a
 *  slug the screen words ("vc-runtime", "files-missing", "dll-too-old"), `error` the server's English. */
const vcRuntimeAnswer = (missing) => ({
  ok: false,
  reason: "vc-runtime",
  missing,
  url: hardware.VC_REDIST_URL,
  error: `Microsoft's Visual C++ runtime (2015–2022) isn't on this computer (${missing.join(", ")} missing) — install it from ${hardware.VC_REDIST_URL}, then try again`,
});
const filesMissingAnswer = (files, why) => ({
  ok: false,
  reason: "files-missing",
  files,
  error: `${why} — an antivirus may have quarantined it: restore it from the antivirus's quarantine, or install the app again`,
});

/**
 * Give every pixel to one part: walk the parts in priority order and let each keep only the
 * pixels no earlier part took. Parts not in `priority` come after the listed ones, in their order.
 * `parts`: [{ key, mask }] (mask may be null). Returns the same list with exclusive masks.
 */
export function resolveOverlaps(parts, priority = DEFAULT_PART_PRIORITY) {
  const rank = (k) => {
    const i = priority.indexOf(k);
    return i < 0 ? priority.length : i;
  };
  const ordered = parts.filter((p) => p.mask).sort((a, b) => rank(a.key) - rank(b.key));
  if (!ordered.length) return parts;
  const taken = new Uint8Array(ordered[0].mask.length);
  const out = new Map();
  for (const p of ordered) {
    const mask = new Uint8Array(p.mask.length);
    let area = 0;
    for (let i = 0; i < mask.length; i++) {
      if (p.mask[i] >= 128 && !taken[i]) {
        mask[i] = 255;
        taken[i] = 1;
        area++;
      }
    }
    out.set(p.key, { ...p, mask, area });
  }
  return parts.map((p) => out.get(p.key) || p);
}

/**
 * The finder. `ctx`: { dataDir, modelDir, providers?, dmlDeviceId?() → the DirectML adapter,
 * partsConfig() → recipe, priority() → keys, idleMs() → ms before the segmenter is released;
 * createSegmenter, loadRuntime, missingDlls, modulePath, ortBinDir (tests swap them) }.
 */
/** A file here at its expected size (its SHA-256 is checked by the install, not here). */
function hasFile(file, size) {
  try {
    return statSync(file).size === size;
  } catch {
    return false;
  }
}

export function createFinder(ctx) {
  let seg = null;
  let runtimeCheck = null;
  let loading = null;
  let idleTimer = null;
  const handles = new Map(); // houseId → encoded photo (the last two)
  // the finds and boxes running on the loaded model: it is let go only once they're done (a model
  // disposed mid-run fails the run — the idle time can be one minute, a part search on a CPU longer)
  let running = 0;
  const drained = [];

  const installed = () => MODEL_FILES.every((f) => existsSync(`${ctx.modelDir}/${f.name}`));

  const touch = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => releaseGpu().catch(() => {}), ctx.idleMs());
    idleTimer.unref?.();
  };

  /** One find or box on the model: no idle release while it runs, the idle time counted from its end. */
  async function using(work) {
    running++;
    clearTimeout(idleTimer);
    try {
      return await work();
    } finally {
      running--;
      if (!running) {
        for (const done of drained.splice(0)) done();
        touch();
      }
    }
  }

  /** Whether ONNX Runtime loads here — and is THIS app's: with the app's onnxruntime.dll quarantined, Windows
   *  11 loaded its own System32 copy (1.17) instead, and the server died mid-Find (2026-10-20, the thirteenth
   *  review). The Visual C++ runtime is looked for each time (installing it needs no restart); the load once. */
  function runtime() {
    const binDir = ctx.ortBinDir === undefined ? ortBinDir() : ctx.ortBinDir;
    const missing = (ctx.missingDlls || hardware.missingDlls)(ORT_VC_DLLS, { appDir: binDir });
    if (missing.length) return Promise.resolve(vcRuntimeAnswer(missing));
    runtimeCheck ??= (async () => {
      try {
        await (ctx.loadRuntime || (() => import("onnxruntime-node")))();
      } catch (e) {
        const error = String(e?.message || e).split("\n")[0];
        log.warning(`the part finder's engine (ONNX Runtime) didn't load: ${error}`); // Settings → Logs
        // Windows' loader words: a file not found (the app's own DLL, once the runtime's are here), an entry point
        // not found (a DLL older than the engine needs)
        if (/specified module could not be found/i.test(error) && binDir && !existsSync(path.join(binDir, "onnxruntime.dll"))) {
          return filesMissingAnswer(["onnxruntime.dll"], "the part finder's engine file onnxruntime.dll is missing from the app");
        }
        if (/specified procedure could not be found/i.test(error)) {
          return {
            ok: false,
            reason: "dll-too-old",
            url: hardware.VC_REDIST_URL,
            error: `a DLL on this computer is older than the part finder's engine needs (${error}) — install the latest Microsoft Visual C++ runtime from ${hardware.VC_REDIST_URL}, then restart the app`,
          };
        }
        return { ok: false, error };
      }
      // the copy the loader took: beside the app's binding, or one of the same name elsewhere
      const where = ctx.modulePath || hardware.loadedModulePath;
      const ort = where("onnxruntime.dll");
      const binding = where("onnxruntime_binding.node");
      // (Windows paths: only Windows answers which module it loaded)
      if (ort && binding && path.win32.dirname(ort).toLowerCase() !== path.win32.dirname(binding).toLowerCase()) {
        log.warning(`the part finder's engine loaded ${ort}, not the app's own beside ${binding}`);
        return filesMissingAnswer(["onnxruntime.dll"], `the app's own onnxruntime.dll is missing, and another copy (${ort}) loaded in its place, which the part finder can't run on`);
      }
      return { ok: true };
    })();
    return runtimeCheck;
  }

  async function segmenter() {
    if (!installed()) {
      throw new ApiError(409, "models-missing", "The part finder isn't installed", "install it first, on a house's Parts tab (about 3.1 GB)");
    }
    if (seg) return seg;
    // never a model on a runtime that isn't the app's, or that doesn't load: refused in words, not a crash mid-Find
    const r = await runtime();
    if (!r.ok) throw new ApiError(503, "runtime-missing", "The part finder can't run on this computer", r.error, r.reason ? { reason: r.reason } : null);
    // onnxruntime-node loads on the first use, not when the server starts: a machine that never
    // finds parts never loads it, and a broken install fails this request, not the server.
    const create = ctx.createSegmenter || (await import("./segment/segmenter.js")).createSegmenter;
    loading ??= create({ modelDir: ctx.modelDir, executionProvider: ctx.providers || DEFAULT_PROVIDERS, dmlDeviceId: ctx.dmlDeviceId?.(), log }).then(
      (s) => {
        seg = s;
        loading = null;
        log.info(`part finder loaded (${JSON.stringify(s.providers)})`);
        return s;
      },
      (e) => {
        loading = null;
        throw e;
      },
    );
    return loading;
  }

  async function encoded(house) {
    const s = await segmenter();
    let h = handles.get(house.id);
    if (!h) {
      h = await s.encode(displayPath(ctx.dataDir, house.id));
      handles.set(house.id, h);
      while (handles.size > 2) {
        const [oldId, old] = handles.entries().next().value;
        handles.delete(oldId);
        s.release(old);
      }
    }
    return { s, h };
  }

  async function releaseGpu() {
    clearTimeout(idleTimer);
    while (running) await new Promise((done) => drained.push(done));
    clearTimeout(idleTimer);
    const s = seg || (loading ? await loading.catch(() => null) : null);
    seg = null;
    handles.clear();
    if (s) {
      await s.dispose();
      log.info("part finder released");
    }
  }

  return {
    installed,
    /** Whether the finder's runtime (onnxruntime-node's native library) loads on this computer:
     *  { ok: true } or { ok: false, error, reason? } — said before a 3.1 GB download that couldn't run (a
     *  Linux build once packed its library where it couldn't load, RESEARCH §13; the Visual C++ runtime
     *  missing, or the app's onnxruntime.dll quarantined, 2026-10-20). */
    runtime,
    /** What Install still downloads: the files not here at their full size (the install card's figure). */
    downloadBytes: () => MODEL_FILES.filter((f) => !hasFile(`${ctx.modelDir}/${f.name}`, f.size)).reduce((n, f) => n + f.size, 0),
    /** Remove the downloaded model (Settings → Storage): the GPU is let go first, then its folder. */
    async uninstall() {
      await releaseGpu();
      // async, with Node's retries: a held file never stalls the server
      await rm(ctx.modelDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    },
    /** Download the models (a job): `download` is the kit's streamDownload. */
    install: ({ download, onProgress, signal }) =>
      ensureModels(ctx.modelDir, { download, onProgress, cancelCheck: () => signal?.aborted }),

    async find(house, { signal, progress }) {
      progress(0.02, "loading");
      const config = validatePartsConfig(ctx.partsConfig() || DEFAULT_PARTS);
      const result = await using(async () => {
        const { s, h } = await encoded(house);
        return findParts(s, h, config, {
          signal,
          houseMargin: ctx.houseMargin?.() ?? 0,
          houseMinShare: ctx.houseMinShare?.() ?? 0.5,
          onProgress: ({ part, index, total }) => progress(0.1 + (0.85 * index) / total, part),
        });
      });
      const byKey = Object.fromEntries(config.map((p) => [p.key, p]));
      const exclusive = resolveOverlaps(result.parts, ctx.priority() || DEFAULT_PART_PRIORITY);
      return exclusive
        .filter((p) => p.mask && p.area > 0)
        // `base`: the part that is the house minus every other (the body — method "subtract"), with `house`,
        // the house's own outline it was cut from
        .map((p) => {
          const base = byKey[p.key]?.method === "subtract";
          return { key: p.key, paintable: byKey[p.key]?.paintable ?? true, score: p.score, mask: p.mask, base, ...(base ? { house: p.instances?.[0]?.mask ?? null } : {}) };
        });
    },

    /** The region inside a box [x0, y0, x1, y1] (display pixels): the best instance's mask. */
    async box(house, { x0, y0, x1, y1 }) {
      const found = await using(async () => {
        const { s, h } = await encoded(house);
        return s.findBoxes(h, [[x0, y0, x1, y1]], { phrase: "visual", mode: "select", threshold: 0.3 });
      });
      const best = found.sort((a, b) => b.score - a.score)[0];
      return best ? best.mask : new Uint8Array(house.displayWidth * house.displayHeight);
    },

    releaseGpu,
  };
}
