// SPDX-License-Identifier: MIT
// The part finder the routes use (parts_api.js): SAM 3 (segment/) on a house's display photo — the app's feature
// `parts.find` on the kit's in-process ONNX runtime (the kit's engines plan, round C). The kit holds the model in
// memory (built by this app's adapter, `sam3Adapter`, with its preset's execution provider), books it with the
// arbiter, and lets it go when idle (AI Settings → Vision), when the AI photo needs the card, or on a reset; its files
// are the kit's (downloaded, checked, removed there).
//   - find(house) — every part of the recipe, each pixel given to ONE part: where parts overlap
//     (the "door" prompt also takes the garage door; "trim" the gutters — RESEARCH §10) the
//     earlier part of the priority list wins. The recipe and the priority are settings rows.
//   - box(house, box) — what is inside a box the user drew (SAM 3's decoder takes boxes, not
//     points: a garage-door box scored 0.983 — RESEARCH §10).
// The encoded photo is kept for the next box on the same house, with the model in memory (a model let go takes it).

import path from "node:path";
import { fileURLToPath } from "node:url";
import { runVisionFeature } from "@delebash/core/llm/image_dispatch";
import { displayPath } from "./files.js";
import { DEFAULT_PARTS, findParts, validatePartsConfig } from "./segment/parts.js";

/** The part finder's feature: its preset names the model (SAM 3) and where it runs (feature_catalog.js, seed_presets.js). */
export const PARTS_FEATURE = "parts.find";

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

/** Where onnxruntime-node keeps this computer's native files (its binding loads them from there) — what the kit's
 *  ONNX runtime check looks at (installLlm's `onnx.binDir`). */
export function ortBinDir() {
  try {
    const pkg = fileURLToPath(import.meta.resolve("onnxruntime-node/package.json")); // the ES-module resolve (no require)
    return path.join(path.dirname(pkg), "bin", "napi-v6", process.platform, process.arch);
  } catch {
    return null;
  }
}

/**
 * SAM 3 as the kit's vision adapter (registerVisionAdapter("sam3", …) in app.js): the segmenter built from the
 * model's files and the app's onnxruntime-node module the kit hands it, with a cache of the last two houses' encoded
 * photos. `createSegmenter` a test's.
 */
export function sam3Adapter({ createSegmenter = null } = {}) {
  return {
    async create({ files, ort, executionProvider, dmlDeviceId, log }) {
      const make = createSegmenter || (await import("./segment/segmenter.js")).createSegmenter;
      const seg = await make({ files, ort, executionProvider, dmlDeviceId, log });
      seg.encodings = new Map(); // houseId → { handle: the encode (a promise), users: the runs on it } — the last two
      return seg;
    },
  };
}

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
 * The finder. `ctx`: { dataDir, partsConfig() → recipe, priority() → keys, houseMargin(), houseMinShare() } — plus
 * `run(fn)`, the kit's runVisionFeature on the part finder's feature (a test's stand-in).
 */
export function createFinder(ctx) {
  const run = ctx.run || ((fn) => runVisionFeature(PARTS_FEATURE, fn));

  /** `fn(handle)` on the house's encoded photo on segmenter `s` — kept for its next box (the last two houses). One run
   *  encodes a house (a second one waits for that encode), and a photo in use is never let go under its run: with
   *  the parts of one house being found while a Box runs on two others, the oldest not in use goes once a run ends.
   *  The run that encodes records that encode with the kit (`recordSpeed`: seconds per image, the vision kind's bands). */
  async function withEncoded(s, house, fn, recordSpeed) {
    let e = s.encodings.get(house.id);
    const encodes = !e;
    if (!e) {
      e = { handle: s.encode(displayPath(ctx.dataDir, house.id)), users: 0 };
      s.encodings.set(house.id, e);
      // an encode that failed isn't kept
      e.handle.catch(() => s.encodings.get(house.id) === e && s.encodings.delete(house.id));
    }
    e.users++;
    try {
      const handle = await e.handle;
      if (encodes) recordSpeed(handle.encodeMs / 1000);
      return await fn(handle);
    } finally {
      e.users--;
      for (const [id, old] of s.encodings) {
        if (s.encodings.size <= 2) break;
        if (old.users) continue;
        s.encodings.delete(id);
        old.handle.then((h) => s.release(h)).catch(() => {});
      }
    }
  }

  return {
    async find(house, { signal, progress }) {
      progress(0.02, "loading");
      const config = validatePartsConfig(ctx.partsConfig() || DEFAULT_PARTS);
      const result = await run((s, { recordSpeed }) =>
        withEncoded(
          s,
          house,
          (handle) =>
            findParts(s, handle, config, {
              signal,
              houseMargin: ctx.houseMargin?.() ?? 0,
              houseMinShare: ctx.houseMinShare?.() ?? 0.5,
              onProgress: ({ part, index, total }) => progress(0.1 + (0.85 * index) / total, part),
            }),
          recordSpeed,
        ),
      );
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
      const found = await run((s, { recordSpeed }) =>
        withEncoded(s, house, (handle) => s.findBoxes(handle, [[x0, y0, x1, y1]], { phrase: "visual", mode: "select", threshold: 0.3 }), recordSpeed),
      );
      const best = found.sort((a, b) => b.score - a.score)[0];
      return best ? best.mask : new Uint8Array(house.displayWidth * house.displayHeight);
    },
  };
}
