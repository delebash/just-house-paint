// SPDX-License-Identifier: MIT
// POST /v1/schemes/ai — AI color schemes for a house (the feature `schemes.suggest`, a prompt row
// the AI Lab edits — app-structure §11). The server reads the house's colors and snaps the AI's
// answer to real paints, so the run is in-process (the kit's runAction), not the renderer's.

import { existsSync, readFileSync } from "node:fs";
import { Hono, input } from "@delebash/core/platform";
import { ApiError, notFound } from "@delebash/core/platform/errors";
import sharp from "sharp";
import { getHouse, listParts } from "../database/houses.js";
import { moduleRows } from "../database/paints.js";
import { displayPath, maskPath } from "../files.js";
import { pngToMask } from "../images.js";
import { BRANDS } from "../paints/index.js";
import { AiSchemesIn } from "../schemas/paints.js";
import { houseFacts, SCHEMES_FEATURE, suggestWithAi } from "../schemes_ai.js";
import { getState } from "../app_state.js";
import { assertGpuFree } from "../jobs.js";

/** A house's facts for the prompt: its display photo's pixels read inside each part's mask. */
export async function factsFor(ctx, house) {
  const parts = listParts(ctx.db, house.id);
  if (!parts.length || !existsSync(displayPath(ctx.dataDir, house.id))) return [];
  const { data } = await sharp(readFileSync(displayPath(ctx.dataDir, house.id))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const masks = {};
  for (const p of parts) {
    const f = maskPath(ctx.dataDir, house.id, p.key);
    if (existsSync(f)) masks[p.key] = await pngToMask(readFileSync(f), house.displayWidth, house.displayHeight);
  }
  return houseFacts({ rgba: data, parts, masks, labelOf: ctx.partLabel });
}

/**
 * `ctx`: { db, dataDir, run(body) → LLMResponse (the kit's runAction), partLabel(key) → the
 *          English name the prompt reads }.
 */
export function router(ctx = getState()) {
  const app = new Hono();

  app.post("/v1/schemes/ai", input({ body: AiSchemesIn }), async (c) => {
    const { houseId, brand, mood, count } = c.req.valid("json");
    // a local AI model would load on the graphics card beside the running one (a cloud one doesn't wait)
    if (ctx.jobs && ctx.usesLocalAi?.(SCHEMES_FEATURE)) assertGpuFree(ctx.jobs, "local-ai");
    const house = getHouse(ctx.db, houseId);
    if (!house) throw notFound(`no house ${houseId}`);
    if (!BRANDS[brand]) throw notFound(`no brand ${brand}`);
    const paints = moduleRows(ctx.db, brand);
    if (!paints.length) throw new ApiError(409, "no-paints", "No colors for this brand yet", `load or import ${BRANDS[brand].label}'s colors first`);
    const facts = await factsFor(ctx, house);
    if (!facts.length) throw new ApiError(409, "no-parts", "Find the parts first", "the AI reads the house's current colors from its parts");
    try {
      return c.json(await suggestWithAi({ run: ctx.run, facts, paints, brand, mood, count }));
    } catch (e) {
      if (e?.name === "LLMNotConfiguredError" || e?.constructor?.name === "LLMNotConfiguredError") {
        throw new ApiError(501, "ai-not-set-up", "AI isn't set up", "choose an AI model in the AI area first");
      }
      if (/AI's answer/.test(String(e?.message))) throw new ApiError(502, "ai-answer-unusable", "The AI's answer couldn't be used", e.message);
      throw e;
    }
  });


  return app;
}
