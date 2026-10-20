// SPDX-License-Identifier: MIT
// The request schemas for paints and color schemes (app-structure §15): each route checks its input
// with the kit's `input()`, and the screens build their form rules from the same objects
// (`schemaRules`). Browser-safe: imports only the kit's `platform/schema` (TypeBox).

import { literal, opt, strictObject, T } from "@delebash/core/platform/schema";

const HEX = "^#[0-9a-fA-F]{6}$";

/** The kinds of color scheme the harmony rules make (paints/harmony.js reads this list). */
export const SCHEME_KINDS = Object.freeze(["complementary", "analogous", "triadic", "monochrome", "classic"]);

/** The brand a path names (`behr`, `sherwin-williams`, …). */
export const BrandParams = T.Object({ key: T.String({ minLength: 1, maxLength: 40, pattern: "^[a-z0-9_-]+$" }) });

/** The paint a path names (`<brand>:<code>`). */
export const PaintParams = T.Object({ id: T.String({ minLength: 1, maxLength: 120 }) });

/** How a brand's colors are listed: by color (a paint store's color wall), or by name. */
export const PAINT_ORDERS = Object.freeze(["color", "name"]);

/** GET /v1/paints — a brand's colors, filtered and paged. */
export const PaintSearch = T.Object({
  brand: opt(T.String({ maxLength: 40 })),
  q: opt(T.String({ maxLength: 80 })),
  family: opt(T.String({ maxLength: 40 })),
  // "neutrals" or a hue family of the setting paints.colorOrder
  colorFamily: opt(T.String({ maxLength: 40 })),
  order: opt(literal(...PAINT_ORDERS), "name"),
  exterior: opt(T.Boolean(), false),
  archived: opt(T.Boolean(), false),
  limit: opt(T.Integer({ minimum: 1, maximum: 500 }), 120),
  // at most what SQLite's integer holds — past 64 bits the search answered 500 (the nineteenth review's fuzz)
  offset: opt(T.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }), 0),
});

/** GET /v1/paints/nearest — the real paints closest to a color. */
export const NearestQuery = T.Object({
  // the example is the form's own words for a hex that isn't one ("Write it like #a1b2c3" — JSON Schema's examples)
  hex: T.String({ pattern: HEX, examples: ["#a1b2c3"] }),
  brand: opt(T.String({ maxLength: 40 })),
  k: opt(T.Integer({ minimum: 1, maximum: 50 }), 6),
  exterior: opt(T.Boolean(), true),
});

/** POST /v1/schemes/harmony — schemes around a base color (a hex color or a paint id). */
export const HarmonyIn = strictObject({
  base: T.String({ minLength: 1, maxLength: 120 }),
  brand: T.String({ minLength: 1, maxLength: 40 }),
  kinds: opt(T.Array(literal(...SCHEME_KINDS), { minItems: 1, maxItems: SCHEME_KINDS.length })),
});

/** POST /v1/schemes/ai — AI schemes for a house; `mood` is the owner's words to the AI. */
export const AiSchemesIn = strictObject({
  houseId: T.String({ minLength: 1, maxLength: 64 }),
  brand: T.String({ minLength: 1, maxLength: 40 }),
  mood: opt(T.String({ maxLength: 200 })),
  count: opt(T.Integer({ minimum: 1, maximum: 6 }), 3),
});
