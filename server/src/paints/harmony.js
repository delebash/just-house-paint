// SPDX-License-Identifier: MIT
// Palette suggestions for a house exterior. From one base color (the body), each scheme sets
// three roles — body, trim, accent (the front door) — as OKLCH targets, then snaps each role to
// the nearest real paint that still keeps the scheme readable: trim visibly lighter or darker
// than the body, the accent colorful enough to read and distinct from the body.
// Every threshold is in HARMONY_DEFAULTS; the app seeds them into its settings and passes them
// back in. The defaults are first proposals, not measured on houses yet.
import { deltaE2000, eligiblePaints, hexToOklch, nearestPaints, normalizeHex, oklchToHex } from "./color.js";

import { SCHEME_KINDS } from "../schemas/paints.js";

export { SCHEME_KINDS };

export const HARMONY_DEFAULTS = Object.freeze({
  kinds: SCHEME_KINDS,
  /** Snap only to paints the source doesn't mark interior-only, and only to current colors. */
  exteriorOnly: true,
  includeArchived: false,
  /** How many nearest paints a role looks through for one that meets its constraint. */
  snapSearch: 200,
  /** Targets stay within this OKLCH lightness range. */
  minL: 0.12,
  maxL: 0.98,
  /** Trim: the snapped trim's OKLCH L differs from the body's by at least this. */
  trimMinDeltaL: 0.15,
  /** Trim: the target sits this far from the body in OKLCH L. */
  trimTargetDeltaL: 0.25,
  /** Trim: bodies darker than this get a lighter trim, lighter bodies a darker one. */
  trimLightenBelowL: 0.75,
  /** Trim: kept near-neutral — at most this OKLCH chroma (tinted toward its scheme hue). */
  trimMaxChroma: 0.03,
  /** Accent: the snapped accent has at least this OKLCH chroma. */
  accentMinChroma: 0.08,
  /** Accent: the target's chroma (at least the body's). */
  accentTargetChroma: 0.12,
  /** Accent: the target sits this far from the body in OKLCH L … */
  accentTargetDeltaL: 0.25,
  /** … darker than the body when the body is lighter than this, else lighter. */
  accentDarkenAboveL: 0.5,
  /** Accent: the snapped accent differs from the body by at least this CIEDE2000. */
  accentMinDeltaE: 15,
  /** Hue steps, in degrees. */
  complementaryAngle: 180,
  analogousAngle: 30,
  triadicAngle: 120,
  /** Monochrome: lightness steps from the body for trim and accent. */
  monoTrimDeltaL: 0.25,
  monoAccentDeltaL: 0.3,
  /** Classic: a mid body (clamped into this L range), light trim, dark accent. */
  classicBodyMinL: 0.45,
  classicBodyMaxL: 0.75,
  classicTrimL: 0.95,
  classicTrimMaxChroma: 0.02,
  classicAccentL: 0.32,
  /** Classic: the door is a traditional door color — the first of these hues (brick red, navy,
   *  forest green) at least classicAccentMinHueGap degrees from the body's (a complementary flip
   *  gave a green house a purple door on Sherwin-Williams' data). */
  classicAccentHues: Object.freeze([25, 255, 150]),
  classicAccentMinHueGap: 60,
  /** Below this OKLCH chroma the base has no usable hue (white, gray, black). */
  achromaticChroma: 0.02,
  /** The accent hue a hue-less base gets in "classic" (25° is a brick red). */
  achromaticAccentHue: 25,
  /** schemesFromCoordinating: at most this many schemes. */
  coordinatingMaxSchemes: 3,
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hue = (h) => ((h % 360) + 360) % 360;
/** The smaller angle between two hues, in degrees. */
const hueGap = (a, b) => {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
};

/** Classic's door hue: the first traditional hue far enough from the body's. */
function classicDoorHue(bodyHue, t) {
  const hues = t.classicAccentHues?.length ? t.classicAccentHues : HARMONY_DEFAULTS.classicAccentHues;
  return hues.find((h) => hueGap(h, bodyHue) >= t.classicAccentMinHueGap) ?? hues[0];
}

// OKLCH per row, computed once per row object.
const lchCache = new WeakMap();
function lchOf(row) {
  let v = lchCache.get(row);
  if (!v) {
    v = hexToOklch(row.hex);
    lchCache.set(row, v);
  }
  return v;
}

function trimTarget(body, h, t, deltaL = t.trimTargetDeltaL) {
  const lighter = body.l < t.trimLightenBelowL;
  let l = clamp(body.l + (lighter ? deltaL : -deltaL), t.minL, t.maxL);
  if (Math.abs(l - body.l) < t.trimMinDeltaL) l = clamp(body.l + (lighter ? -deltaL : deltaL), t.minL, t.maxL);
  return { l, c: Math.min(body.c, t.trimMaxChroma), h: hue(h) };
}

function accentTarget(body, h, t, deltaL = t.accentTargetDeltaL) {
  const darker = body.l > t.accentDarkenAboveL;
  const l = clamp(body.l + (darker ? -deltaL : deltaL), t.minL, t.maxL);
  return { l, c: Math.max(body.c, t.accentTargetChroma), h: hue(h) };
}

/** OKLCH targets per role for one scheme kind; null when the kind needs a hue the base lacks. */
export function schemeTargets(kind, base, t) {
  const achromatic = base.c < t.achromaticChroma;
  const h = base.h;
  switch (kind) {
    case "complementary":
      if (achromatic) return null;
      return { body: base, trim: trimTarget(base, h, t), accent: accentTarget(base, h + t.complementaryAngle, t) };
    case "analogous":
      if (achromatic) return null;
      return { body: base, trim: trimTarget(base, h + t.analogousAngle, t), accent: accentTarget(base, h - t.analogousAngle, t) };
    case "triadic":
      if (achromatic) return null;
      return { body: base, trim: trimTarget(base, h + t.triadicAngle, t), accent: accentTarget(base, h + 2 * t.triadicAngle, t) };
    case "monochrome":
      if (achromatic) return null;
      return { body: base, trim: trimTarget(base, h, t, t.monoTrimDeltaL), accent: accentTarget(base, h, t, t.monoAccentDeltaL) };
    case "classic": {
      const body = { ...base, l: clamp(base.l, t.classicBodyMinL, t.classicBodyMaxL) };
      return {
        body,
        trim: { l: t.classicTrimL, c: Math.min(base.c, t.classicTrimMaxChroma), h: hue(h) },
        accent: {
          l: t.classicAccentL,
          c: Math.max(base.c, t.accentTargetChroma),
          h: hue(achromatic ? t.achromaticAccentHue : classicDoorHue(h, t)),
        },
      };
    }
    default:
      throw new Error(`unknown scheme kind "${kind}"`);
  }
}

/** The nearest paint to a target that passes `accept`; { target, paint: null } when none does. */
function snap(targetHex, pool, accept, t) {
  const found = nearestPaints(targetHex, pool, {
    k: t.snapSearch,
    prefilter: t.snapSearch,
    exteriorOnly: false,
    includeArchived: true,
  });
  const hit = found.find((c) => accept(c.paint));
  return hit ? { target: targetHex, paint: hit.paint, deltaE: hit.deltaE } : { target: targetHex, paint: null, deltaE: null };
}

const trimOk = (trim, body, t) => trim !== body && Math.abs(lchOf(trim).l - lchOf(body).l) >= t.trimMinDeltaL;
const accentOk = (accent, body, trim, t) =>
  accent !== body && accent !== trim && lchOf(accent).c >= t.accentMinChroma && deltaE2000(accent, body) >= t.accentMinDeltaE;

/**
 * Schemes from one base color, each role snapped to a real paint.
 * @param {string|object} base  a hex color, or a paint row (then it is the body as-is)
 * @param {object[]} paints     normalized rows (any brands; `brand` narrows them)
 * @param {object} options      { brand, kinds, …any HARMONY_DEFAULTS key }
 * @returns {{ kind, base, roles: { body, trim, accent } | null, complete: boolean, notes: string[] }[]}
 *   each role is { target: hex, paint: row|null, deltaE: number|null }
 */
export function suggestSchemes(base, paints, options = {}) {
  const t = { ...HARMONY_DEFAULTS, ...options };
  const pool = eligiblePaints(paints, t);
  const baseRow = typeof base === "object" && base ? base : null;
  const baseHex = normalizeHex(baseRow ? baseRow.hex : base);
  if (!baseHex) throw new TypeError("suggestSchemes needs a hex color or a paint row");
  const baseLch = hexToOklch(baseHex);
  const out = [];
  for (const kind of t.kinds) {
    const targets = schemeTargets(kind, baseLch, t);
    if (!targets) {
      out.push({ kind, base: baseHex, roles: null, complete: false, notes: ["the base color has no hue to build this scheme on"] });
      continue;
    }
    const hex = Object.fromEntries(Object.entries(targets).map(([role, lch]) => [role, oklchToHex(lch)]));
    const notes = [];
    const body =
      baseRow && kind !== "classic"
        ? { target: baseHex, paint: baseRow, deltaE: 0 }
        : snap(hex.body, pool, () => true, t);
    if (!body.paint) {
      out.push({ kind, base: baseHex, roles: null, complete: false, notes: ["no paint to snap the body to"] });
      continue;
    }
    const trim = snap(hex.trim, pool, (p) => trimOk(p, body.paint, t), t);
    if (!trim.paint) notes.push("no paint near the trim target is light or dark enough against the body");
    const accent = snap(hex.accent, pool, (p) => accentOk(p, body.paint, trim.paint, t), t);
    if (!accent.paint) notes.push("no paint near the accent target is colorful and distinct enough");
    out.push({ kind, base: baseHex, roles: { body, trim, accent }, complete: Boolean(trim.paint && accent.paint), notes });
  }
  return out;
}

/**
 * Schemes from a brand's own coordinating colors (the feeds list two or three per color; Sherwin-
 * Williams' third is a matching white). `row` is the body; each pairing of its coordinating colors
 * as trim and accent is checked against the same constraints and ranked: both roles valid first,
 * then the larger trim contrast, then the more colorful accent. A pairing is the brand's, so it
 * always applies (`complete`) — the body and trim, and the accent when the brand lists one; what
 * the constraints found stays in its `notes`, shown beside it, never a block (2026-10-28: as a block
 * they left 1,654 of Sherwin-Williams' 1,746 colors with pairings none to apply — the brands pair a
 * color with soft neutrals, which the accent's chroma rule refuses).
 */
export function schemesFromCoordinating(row, paints, options = {}) {
  const t = { ...HARMONY_DEFAULTS, ...options };
  const pool = eligiblePaints(paints, { ...t, brand: row.brand });
  const byCode = new Map(pool.map((p) => [String(p.code), p]));
  const coords = [...new Set(row.coordinating ?? [])].map((c) => byCode.get(String(c))).filter((p) => p && p !== row);
  if (coords.length === 0) return [];
  const role = (p) => (p ? { target: p.hex, paint: p, deltaE: 0 } : { target: null, paint: null, deltaE: null });
  const options_ = [];
  for (const trim of coords) {
    const accents = coords.filter((a) => a !== trim);
    for (const accent of accents.length ? accents : [null]) {
      const tOk = trimOk(trim, row, t);
      const aOk = accent ? accentOk(accent, row, trim, t) : false;
      const notes = [];
      if (!tOk) notes.push("the trim is not light or dark enough against the body");
      if (!accent) notes.push("the brand lists no further coordinating color for the accent");
      else if (!aOk) notes.push("the accent is not colorful or distinct enough");
      options_.push({
        scheme: { kind: "coordinating", base: row.hex, roles: { body: role(row), trim: role(trim), accent: role(accent) }, complete: true, notes },
        score: [Number(tOk) + Number(aOk), Math.abs(lchOf(trim).l - lchOf(row).l), accent ? lchOf(accent).c : 0],
      });
    }
  }
  options_.sort((x, y) => y.score[0] - x.score[0] || y.score[1] - x.score[1] || y.score[2] - x.score[2]);
  return options_.slice(0, t.coordinatingMaxSchemes).map((o) => o.scheme);
}
