// SPDX-License-Identifier: MIT
// The request schemas for houses, parts and designs (app-structure §15): each route checks its
// body with the kit's `input()`, and the screens build their form rules from the same objects
// (`schemaRules`). Imports only the kit's browser-safe schema helpers.

import { literal, opt, strictObject, T } from "@delebash/core/platform/schema";

/** A part's key: a camelCase word ("garageDoor") — the part finder's recipe names them so. Never a Windows device
 *  name (con, prn, aux, nul, com0–9, lpt0–9): a key is its outline's file name (masks/<key>.png), and on Windows 10
 *  those are devices, not files (the nineteenth review's fuzz). */
export const PART_KEY = "^(?!(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$)[a-z][a-zA-Z0-9]{0,39}$";

/** An id the server made (a random UUID) — also a folder name, so nothing that could leave it. */
const Id = T.String({ minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" });

/** The house, design, render or job a path names. */
export const IdParams = T.Object({ id: Id });

/** A part of a house a path names. */
export const PartParams = T.Object({ id: Id, key: T.String({ pattern: PART_KEY }) });

/** GET /v1/houses/:id/image — which copy of the photo (`v` is the screen's cache-buster). */
export const ImageQuery = T.Object({
  size: opt(literal("display", "thumb", "original"), "display"),
  v: opt(T.String({ maxLength: 80 })),
});

/** A name a person gives: something besides spaces (the routes trim it). */
const Name = (maxLength) => T.String({ minLength: 1, maxLength, pattern: "\\S" });

export const HousePatch = strictObject({
  name: Name(80),
});

/** PUT /v1/houses/:id/current-paints — the paint each part has now, { part: paintId }, the whole map. */
// a house has at most 40 parts (the finder's recipe) and a few added: more keys than this is no house's (100,000 were
// taken and made the house's answer 1.8 MB — the nineteenth review's fuzz)
const MAX_PARTS = 100;

export const CurrentPaintsIn = T.Record(T.String({ pattern: PART_KEY }), T.String({ minLength: 1, maxLength: 120 }), {
  additionalProperties: false, // a key that isn't a part name is refused, not stored
  maxProperties: MAX_PARTS,
});

/** PATCH /v1/houses/:id/current-paints — only the parts named (JSON Merge Patch): { part: paintId | null }, null
 *  makes a part's paint unknown again. */
export const CurrentPaintsPatch = T.Record(T.String({ pattern: PART_KEY }), T.Union([T.String({ minLength: 1, maxLength: 120 }), T.Null()]), {
  additionalProperties: false,
  maxProperties: MAX_PARTS,
});

/** { partKey: paintId | null } — a new design: null (or absent) leaves a part unpainted; a PATCH: only the parts
 *  named change (JSON Merge Patch, RFC 7396 — null takes a part's color off). */
export const DesignColors = T.Record(T.String({ pattern: PART_KEY }), T.Union([T.String({ minLength: 1, maxLength: 120 }), T.Null()]), {
  additionalProperties: false, // a key that isn't a part name is refused, not stored
  maxProperties: MAX_PARTS,
});

export const DesignIn = strictObject({
  name: Name(60),
  colors: opt(DesignColors, {}),
});

/** A design used on another house (POST /v1/designs/:id/copy): the house it goes to. */
export const DesignCopyIn = strictObject({
  houseId: T.String({ minLength: 1, maxLength: 64 }),
});

export const DesignPatch = strictObject({
  name: opt(Name(60)),
  colors: opt(DesignColors),
});

/**
 * A box drawn on the photo, in display pixels: what the part finder sees inside it joins (`add`)
 * or leaves (`remove`) the part. (SAM 3's decoder takes boxes, not points — RESEARCH §10.)
 */
export const BoxIn = strictObject({
  x0: T.Number({ minimum: 0 }),
  y0: T.Number({ minimum: 0 }),
  x1: T.Number({ minimum: 0 }),
  y1: T.Number({ minimum: 0 }),
  mode: opt(literal("add", "remove"), "add"),
});

/**
 * POST /v1/houses/:id/find-parts — `keepEdited`: the parts changed by hand (edited or added) stay as
 * they are, and the parts found now are cut around them. No body finds every part again.
 */
export const FindPartsIn = T.Union([T.Null(), strictObject({ keepEdited: opt(T.Boolean(), false) })]);

/** A part made by hand (the brush on a part the finder didn't name). */
export const PartNew = strictObject({
  key: T.String({ pattern: PART_KEY }),
  paintable: opt(T.Boolean(), true),
});

/** POST /v1/houses/:id/aiphoto — a saved design, or the colors on screen ({ part: paintId }). */
export const AiPhotoIn = strictObject({
  designId: opt(T.String({ minLength: 1, maxLength: 64 })),
  colors: opt(DesignColors),
});
