// SPDX-License-Identifier: MIT
// Color math for paints: conversions, CIEDE2000, nearest real paints, WCAG contrast and LRV.
// culori (MIT) does the conversions; L*a*b* is CIE D65 throughout (culori's "lab65"), the same
// conversion the brands' feeds use for their own L*a*b*.
import { converter, differenceCiede2000, formatHex, parse, toGamut, wcagContrast, wcagLuminance } from "culori";
import { hexToLab, hexToRgb, normalizeHex, rgbToHex } from "./normalize.js";

export { hexToLab, hexToRgb, normalizeHex, rgbToHex };

const toOklab = converter("oklab");
const toOklch = converter("oklch");
const toRgbGamut = toGamut("rgb", "oklch");
const ciede2000 = differenceCiede2000();

/** Search settings for `nearestPaints`; the app seeds these into its settings table. */
export const NEAREST_DEFAULTS = Object.freeze({
  k: 5,
  /** How many OKLab-nearest candidates go on to the exact CIEDE2000 ranking. */
  prefilter: 64,
  /** Leave out rows the source marks exterior: false. Rows that don't say are kept. */
  exteriorOnly: false,
  /** Discontinued colors can't be bought; leave them out unless asked. */
  includeArchived: false,
});

/** [L, a, b] (D65) → "#rrggbb", gamut-mapped in OKLCH when it falls outside sRGB. */
export function labToHex([l, a, b]) {
  return formatHex(toRgbGamut({ mode: "lab65", l, a, b }));
}

/** "#rrggbb" → OKLab [L, a, b]. */
export function hexToOklab(hex) {
  const c = toOklab(parse(normalizeHex(hex)));
  return [c.l, c.a ?? 0, c.b ?? 0];
}

/** "#rrggbb" → OKLCH { l, c, h } (h in degrees; 0 when the color has no hue). */
export function hexToOklch(hex) {
  const c = toOklch(parse(normalizeHex(hex)));
  return { l: c.l, c: c.c ?? 0, h: c.h ?? 0 };
}

/** OKLCH { l, c, h } → "#rrggbb", gamut-mapped to sRGB (CSS Color 4's chroma reduction). */
export function oklchToHex({ l, c, h }) {
  return formatHex(toRgbGamut({ mode: "oklch", l, c, h }));
}

/** A color given as a row ({ lab }), a hex string, or [L, a, b] (D65) → culori Lab object. */
function asLab(x) {
  let lab;
  if (Array.isArray(x)) lab = x;
  else if (typeof x === "string") lab = hexToLab(x);
  else if (x && Array.isArray(x.lab)) lab = x.lab;
  else if (x && typeof x.hex === "string") lab = hexToLab(x.hex);
  else throw new TypeError("expected a hex string, [L,a,b] or a paint row");
  // culori's CIEDE2000 reads its input as "lab65", so D65 values pass through unconverted.
  return { mode: "lab65", l: lab[0], a: lab[1], b: lab[2] };
}

/** CIEDE2000 between two colors (hex strings, D65 [L,a,b] arrays or paint rows). */
export function deltaE2000(a, b) {
  return ciede2000(asLab(a), asLab(b));
}

// OKLab per row, computed once per row object.
const oklabCache = new WeakMap();
function rowOklab(row) {
  let v = oklabCache.get(row);
  if (!v) {
    v = hexToOklab(row.hex);
    oklabCache.set(row, v);
  }
  return v;
}

/** The rows a search may return, given brand / exterior / archived filters. */
export function eligiblePaints(paints, { brand, exteriorOnly, includeArchived } = {}) {
  return paints.filter(
    (p) =>
      (!brand || p.brand === brand) &&
      (!exteriorOnly || p.exterior !== false) &&
      (includeArchived || p.archived !== true),
  );
}

/**
 * The k real paints closest to a color: OKLab distance picks `prefilter` candidates, CIEDE2000
 * ranks them. Returns [{ paint, deltaE }] nearest first.
 */
export function nearestPaints(target, paints, options = {}) {
  const o = { ...NEAREST_DEFAULTS, ...options };
  const pool = eligiblePaints(paints, o);
  if (pool.length === 0) return [];
  const t = typeof target === "string" ? hexToOklab(target) : hexToOklab(target.hex);
  const scored = pool.map((p) => {
    const q = rowOklab(p);
    return { p, d: (q[0] - t[0]) ** 2 + (q[1] - t[1]) ** 2 + (q[2] - t[2]) ** 2 };
  });
  scored.sort((x, y) => x.d - y.d);
  const n = Math.min(scored.length, Math.max(o.prefilter, o.k));
  const tLab = asLab(target);
  return scored
    .slice(0, n)
    .map(({ p }) => ({ paint: p, deltaE: ciede2000(tLab, asLab(p)) }))
    .sort((x, y) => x.deltaE - y.deltaE)
    .slice(0, o.k);
}

/** WCAG 2 contrast ratio (1..21) between two colors. */
export function contrastRatio(a, b) {
  return wcagContrast(normalizeHex(a), normalizeHex(b));
}

/**
 * LRV estimated from a color: CIE Y × 100 of its sRGB value. Brands measure LRV on the physical
 * paint; Sherwin-Williams' published LRVs match this estimate within 0.27 on average (2,004
 * colors, 2026-10-17), so it stands in when a source gives none.
 */
export function estimateLrv(hex) {
  return wcagLuminance(normalizeHex(hex)) * 100;
}

/** A row's LRV: the brand's own when given, else the estimate. */
export function lrvOf(row) {
  return row.lrv ?? estimateLrv(row.hex);
}

/** The absolute LRV difference between two rows (or hex colors). */
export function lrvDifference(a, b) {
  const v = (x) => (typeof x === "string" ? estimateLrv(x) : lrvOf(x));
  return Math.abs(v(a) - v(b));
}
