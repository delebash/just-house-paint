// SPDX-License-Identifier: MIT
// /v1/settings — the app's own settings, one schema per key (app-structure §16; the keys and
// their schemas: schemas/settings.js; their first values: database/seed.js). The renderer's
// preferences are /v1/prefs, a different door (prefs_api.js).
//
//   GET   /v1/settings  → {key: value} for every known key that has a row
//   PATCH /v1/settings  SettingsPatch → the same document | 422 (a value out of range, a key
//                       that isn't a setting)

import { Hono, input } from "@delebash/core/platform";
import { RequestValidationError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { DEFAULT_COMPOSE } from "../aiphoto/pixels.js";
import { getDb } from "../app_state.js";
import { readSettings, writeSettings } from "../database/settings.js";
import { HARMONY_DEFAULTS, NEUTRALS, SCHEME_KINDS } from "../paints/index.js";
import { SETTING_KEYS, SettingsPatch } from "../schemas/settings.js";
import { validatePartsConfig } from "../segment/parts.js";

const log = getLogger("just_house_paint.settings");

/** Each value of `value` that its defaults know has its default's type (a list its element type; a
 *  pair of numbers — a range — stays a pair). A key the defaults don't know is left alone: an older
 *  install may still carry a retired one, and nothing reads it. Throws a TypeError naming the first
 *  wrong one. */
function likeDefaults(value, defaults) {
  for (const [k, v] of Object.entries(value)) {
    if (!(k in defaults)) continue;
    const d = defaults[k];
    if (Array.isArray(d)) {
      const want = typeof d[0];
      if (!Array.isArray(v) || v.some((x) => typeof x !== want)) throw new TypeError(`"${k}" must be a list of ${want}s`);
      if (want === "number" && d.length === 2 && v.length !== 2) throw new TypeError(`"${k}" must be two numbers (a range)`);
    } else if (typeof v !== typeof d) throw new TypeError(`"${k}" must be a ${typeof d}`);
  }
}

/** Where each compositing number means something — past it, every AI photo later fails (a featherPx of 1e308 is a
 *  blur sharp refuses: its sigma is 0.3–1000) or comes out wrong (an insideAt of 0 makes the whole photo the
 *  surface). A pair is a range: its low end below its high end. */
const COMPOSE_LIMITS = {
  featherPx: [0, 1000],
  insideAt: [0.01, 1],
  basePercentile: [0, 100],
  litBand: [0, 10],
  repaintedRange: [0, 100],
  sameColorDeltaE: [0, 200],
  gainLimits: [0.01, 100],
};

function composeInRange(value) {
  for (const [k, [lo, hi]] of Object.entries(COMPOSE_LIMITS)) {
    if (!(k in value)) continue;
    const v = value[k];
    if ((Array.isArray(v) ? v : [v]).some((n) => !(n >= lo && n <= hi))) throw new TypeError(`"${k}" must be from ${lo} to ${hi}`);
    if (Array.isArray(v) && !(v[0] < v[1])) throw new TypeError(`"${k}" is a range: its first number must be below its second`);
  }
}

/**
 * The checks a key's schema can't make — the ones whose mistake would only show later, as every run
 * failing: the finder's parts (a `minus` naming a part not in the list…), the harmony rules' kinds
 * and types, the AI photo's compositing values, the color families' keys.
 */
const MEANING = {
  "finder.parts": (v) => validatePartsConfig(v),
  "schemes.harmony": (v) => {
    likeDefaults(v, HARMONY_DEFAULTS);
    // findIndex, not find: a kind of "" is falsy and passed (the twentieth review's fuzz)
    const at = (v.kinds || []).findIndex((k) => !SCHEME_KINDS.includes(k));
    if (at >= 0) throw new TypeError(`"${v.kinds[at]}" isn't a scheme kind (${SCHEME_KINDS.join(", ")})`);
    // no kind at all and every scheme came back empty, silently (the nineteenth review's fuzz)
    if (Array.isArray(v.kinds) && !v.kinds.length) throw new TypeError(`name at least one scheme kind (${SCHEME_KINDS.join(", ")})`);
  },
  "aiphoto.compose": (v) => {
    likeDefaults(v, DEFAULT_COMPOSE);
    composeInRange(v);
  },
  "paints.colorOrder": (v) => {
    const keys = v.families.map((f) => f.key);
    const twice = keys.find((k, i) => keys.indexOf(k) !== i);
    if (twice) throw new TypeError(`the family "${twice}" is listed twice`);
    if (keys.includes(NEUTRALS)) throw new TypeError(`"${NEUTRALS}" is the near-grays' name — give the hue family another`);
  },
};

/** What's wrong with `value` for `key` beyond its schema (MEANING), or null. A restore asks it too: an older backup's
 *  row that fails it is set back to its default (data_admin.js resetUnfitSettings — the twentieth review). */
export function meaningProblem(key, value) {
  try {
    MEANING[key]?.(value);
    return null;
  } catch (e) {
    return String(e?.message || e);
  }
}

export function router() {
  const app = new Hono();

  app.get("/v1/settings", (c) => c.json(readSettings(getDb(), SETTING_KEYS)));

  app.patch("/v1/settings", input({ body: SettingsPatch }), (c) => {
    const patch = c.req.valid("json");
    const wrong = [];
    for (const [key, value] of Object.entries(patch)) {
      const msg = meaningProblem(key, value);
      if (msg) wrong.push({ loc: ["body", key], msg, type: "value_error" });
    }
    if (wrong.length) throw new RequestValidationError(wrong);
    writeSettings(getDb(), patch);
    const keys = Object.keys(patch);
    if (keys.length) log.info(`settings changed: ${keys.join(", ")}`);
    return c.json(readSettings(getDb(), SETTING_KEYS));
  });

  return app;
}
