// SPDX-License-Identifier: MIT
// The AI photo (PRD F8, an option button): FLUX.2 [klein] 4B repaints the chosen parts inside their outlines, then
// the photo is pasted back and the paint locked (aiphoto/). The engine and the model are the kit's — its
// stable-diffusion.cpp runtime installs, downloads, rates and runs them (the kit's engines plan, H1); the drawing is
// the app's `aiphoto.render` feature, run through the kit's runImageFeature (its preset holds the model and the
// recipe). This service owns one render: it checks the feature can run (the kit's readiness) and composes the
// result; the room on the graphics card is the kit's arbiter's to make — it lets the part finder (SAM 3) or the chat
// model go when idle, and says the card is busy while one works (the engines plan, round C).

import { mkdirSync } from "node:fs";
import path from "node:path";
import { imageFeatureReadiness, runImageFeature } from "@delebash/core/llm/image_dispatch";
import { ApiError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { aiRepaint as realRepaint } from "./aiphoto/edit.js";
import { maskPath, originalPath, renderPath } from "./files.js";

const log = getLogger("just_house_paint.aiphoto");

/** The AI photo's feature: its preset names the model and the recipe (feature_catalog.js, seed_presets.js). */
export const AIPHOTO_FEATURE = "aiphoto.render";

/** A part key in the English the model reads ("garageDoor" → "garage door") — prompts stay English
 * (RESEARCH §10: French labels barely changed the color). */
export const surfaceWords = (key) => WORDS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
// the parts whose key alone reads wrong to the model
const WORDS = { decor: "wall decorations" };

/** Why the AI photo can't run yet, in words — the kit's readiness `need` (the house page's banner offers the step). */
function notReady(r) {
  const what = {
    "engine-not-installed": "install its engine first (stable-diffusion.cpp) — on the house page, or on the AI page's Images tab",
    "model-not-downloaded": `download its model first (${r.modelState?.name || r.model}) — on the house page, or on the AI page's Images tab`,
    "engine-cant-run-here": r.engine?.need?.detail || "this computer can't run its engine",
  }[r.need];
  return new ApiError(409, "aiphoto-not-installed", "The AI photo isn't installed", what || r.detail || "choose its model on the AI page, under Routing by feature", {
    need: r.need,
  });
}

/**
 * `ctx`: { dataDir, settings: { templates(), compose(), workingSize(), fullSizeMaxPixels() } } —
 * plus `aiRepaint`, `generate(request, {onProgress, signal})` (the kit's runImageFeature on the AI photo's feature)
 * and `readiness()` (the kit's imageFeatureReadiness) for tests.
 */
export function createAiPhoto(ctx) {
  const aiRepaint = ctx.aiRepaint || realRepaint;
  const generate = ctx.generate || ((request, opts) => runImageFeature(AIPHOTO_FEATURE, request, opts));
  const readiness = ctx.readiness || (() => imageFeatureReadiness(AIPHOTO_FEATURE));

  return {
    /** Whether the AI photo can run now — the kit's readiness for its feature. */
    readiness,

    /**
     * One AI photo of `house` with `surfaces`: [{ key, hex, name, currentHex? }] (paintable parts with
     * a paint; `currentHex` the paint the part has now, when its owner said).
     * Returns { file, deltaE, worstPart, seconds, engine } — worstPart the key of the part whose ΔE that is.
     */
    async render(house, surfaces, { renderId, signal, progress }) {
      if (!surfaces.length) throw new ApiError(422, "nothing-to-paint", "Pick colors first", "give at least one part a paint color");
      const ready = readiness();
      if (!ready.ready) throw notReady(ready);
      signal?.throwIfAborted();
      const t0 = Date.now();
      const out = renderPath(ctx.dataDir, house.id, renderId);
      // a backup keeps no empty folder: a house restored before its first AI photo has no renders folder
      mkdirSync(path.dirname(out), { recursive: true });
      const result = await aiRepaint({
        generate,
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
      const seconds = (Date.now() - t0) / 1000;
      // the part whose ΔE is the picture's (the worst) — aiRepaint gives each surface's, in the order given
      let worst = -1;
      (result.surfaces ?? []).forEach((s, i) => {
        if (s?.deltaE != null && (worst < 0 || s.deltaE > result.surfaces[worst].deltaE)) worst = i;
      });
      const worstPart = worst >= 0 ? (surfaces[worst]?.key ?? null) : null;
      log.info(`AI photo of ${house.id}: ${seconds.toFixed(1)} s, ΔE ${result.deltaE}${worstPart ? ` (${worstPart})` : ""}`);
      return { file: path.basename(out), deltaE: result.deltaE, worstPart, seconds, engine: "sd.cpp FLUX.2 klein 4B" };
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
