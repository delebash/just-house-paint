// SPDX-License-Identifier: MIT
// The request schemas for houses, parts and designs (app-structure §15): each route checks its
// body with the kit's `input()`, and the screens build their form rules from the same objects
// (`schemaRules`). Imports only the kit's browser-safe schema helpers.

import { literal, opt, strictObject, T } from "@delebash/core/platform/schema";

/** A part's key: a camelCase word ("garageDoor") — the part finder's recipe names them so. */
export const PART_KEY = "^[a-z][a-zA-Z0-9]{0,39}$";

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
export const CurrentPaintsIn = T.Record(T.String({ pattern: PART_KEY }), T.String({ minLength: 1, maxLength: 120 }), {
  additionalProperties: false, // a key that isn't a part name is refused, not stored
});

/** { partKey: paintId | null } — null (or absent) leaves a part unpainted. */
export const DesignColors = T.Record(T.String({ pattern: PART_KEY }), T.Union([T.String({ minLength: 1, maxLength: 120 }), T.Null()]), {
  additionalProperties: false, // a key that isn't a part name is refused, not stored
});

export const DesignIn = strictObject({
  name: Name(60),
  colors: opt(DesignColors, {}),
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
