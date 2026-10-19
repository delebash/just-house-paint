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

import { existsSync, rmSync, statSync } from "node:fs";
import { ApiError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
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
 * The finder. `ctx`: { dataDir, modelDir, providers?, partsConfig() → recipe, priority() →
 * keys, idleMs() → ms before the segmenter is released; createSegmenter (tests swap it) }.
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
  let loading = null;
  let idleTimer = null;
  const handles = new Map(); // houseId → encoded photo (the last two)

  const installed = () => MODEL_FILES.every((f) => existsSync(`${ctx.modelDir}/${f.name}`));

  const touch = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => releaseGpu().catch(() => {}), ctx.idleMs());
    idleTimer.unref?.();
  };

  async function segmenter() {
    if (!installed()) {
      throw new ApiError(409, "models-missing", "The part finder isn't installed", "download the part-finding model first (about 3.4 GB)");
    }
    if (seg) return seg;
    // onnxruntime-node loads on the first use, not when the server starts: a machine that never
    // finds parts never loads it, and a broken install fails this request, not the server.
    const create = ctx.createSegmenter || (await import("./segment/segmenter.js")).createSegmenter;
    loading ??= create({ modelDir: ctx.modelDir, executionProvider: ctx.providers || DEFAULT_PROVIDERS, log }).then(
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
    /** What Install still downloads: the files not here at their full size (the install card's figure). */
    downloadBytes: () => MODEL_FILES.filter((f) => !hasFile(`${ctx.modelDir}/${f.name}`, f.size)).reduce((n, f) => n + f.size, 0),
    /** Remove the downloaded model (Settings → Storage): the GPU is let go first, then its folder. */
    async uninstall() {
      await releaseGpu();
      rmSync(ctx.modelDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
    /** Download the models (a job): `download` is the kit's streamDownload. */
    install: ({ download, onProgress, signal }) =>
      ensureModels(ctx.modelDir, { download, onProgress, cancelCheck: () => signal?.aborted }),

    async find(house, { signal, progress }) {
      progress(0.02, "loading");
      const { s, h } = await encoded(house);
      touch();
      const config = validatePartsConfig(ctx.partsConfig() || DEFAULT_PARTS);
      const result = await findParts(s, h, config, {
        signal,
        houseMargin: ctx.houseMargin?.() ?? 0,
        houseMinShare: ctx.houseMinShare?.() ?? 0.5,
        onProgress: ({ part, index, total }) => progress(0.1 + (0.85 * index) / total, part),
      });
      touch();
      const byKey = Object.fromEntries(config.map((p) => [p.key, p]));
      const exclusive = resolveOverlaps(result.parts, ctx.priority() || DEFAULT_PART_PRIORITY);
      return exclusive
        .filter((p) => p.mask && p.area > 0)
        .map((p) => ({ key: p.key, paintable: byKey[p.key]?.paintable ?? true, score: p.score, mask: p.mask }));
    },

    /** The region inside a box [x0, y0, x1, y1] (display pixels): the best instance's mask. */
    async box(house, { x0, y0, x1, y1 }) {
      const { s, h } = await encoded(house);
      touch();
      const found = await s.findBoxes(h, [[x0, y0, x1, y1]], { phrase: "visual", mode: "select", threshold: 0.3 });
      touch();
      const best = found.sort((a, b) => b.score - a.score)[0];
      return best ? best.mask : new Uint8Array(house.displayWidth * house.displayHeight);
    },

    releaseGpu,
  };
}
