// SPDX-License-Identifier: MIT
// Ordering a brand's colors by color, as a paint store's color wall (RESEARCH §10, "Ordering by color"): the
// near-grays first — CIE chroma under `grayChroma`, whites to blacks — then bands of
// `bandDegrees` of CIE LCh hue in rainbow order from the first family's start, each light to dark.
// The families (the Colors tab's Color family filter) are hue ranges, each from its `from` to the
// next one's; the default cuts are the ones that misfile the fewest of the brands' own labels on the
// ~17,100 colors measured (RESEARCH §10, "Ordering by color"). The setting `paints.colorOrder` holds
// them; database/paints.js runs the same math in SQL, so paging and search keep working.

/** The near-grays' family key (chroma under `grayChroma`, any hue). */
export const NEUTRALS = "neutrals";

export const COLOR_ORDER_DEFAULTS = Object.freeze({
  grayChroma: 8,
  bandDegrees: 30,
  families: Object.freeze(
    [
      { key: "reds", from: 333 },
      { key: "oranges", from: 45 },
      { key: "yellows", from: 72 },
      { key: "greens", from: 98 },
      { key: "blues", from: 181 },
      { key: "purples", from: 271 },
    ].map(Object.freeze),
  ),
});

/** CIE LCh from CIELAB: { chroma, hue } (hue in degrees, 0–360). */
export function lch([, a, b]) {
  return { chroma: Math.hypot(a, b), hue: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** A family's hue range: its start and how many degrees it spans (to the next family's start). */
export function familySpan(order, key) {
  const fams = order.families;
  const i = fams.findIndex((f) => f.key === key);
  if (i < 0) return null;
  const from = fams[i].from;
  const to = fams[(i + 1) % fams.length].from;
  return { from, span: (to - from + 360) % 360 || 360 };
}

/** The family keys a search may name: the near-grays, then the hue families in their order. */
export const familyKeys = (order) => [NEUTRALS, ...order.families.map((f) => f.key)];

/** The family a color falls in (the same rule as the SQL). */
export function familyOf(lab, order = COLOR_ORDER_DEFAULTS) {
  const { chroma, hue } = lch(lab);
  if (chroma < order.grayChroma) return NEUTRALS;
  for (const f of order.families) {
    const { from, span } = familySpan(order, f.key);
    if ((hue - from + 360) % 360 < span) return f.key;
  }
  return null;
}
