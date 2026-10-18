// SPDX-License-Identifier: MIT
// A SYNTHETIC paint list for color and harmony tests: an even OKLCH grid (hues every 15°,
// several lightness and chroma steps, plus neutrals), turned into normalized rows. Invented codes
// "T-<n>"; none is a brand color.
import { oklchToHex } from "../../../src/paints/color.js";
import { normalizeRow } from "../../../src/paints/normalize.js";

export function syntheticPalette({ brand = "sherwin-williams", hueStep = 15 } = {}) {
  const rows = [];
  let n = 0;
  const add = (lch, extra = {}) => {
    n += 1;
    rows.push(
      normalizeRow(
        { code: `T-${n}`, name: `Test ${n}`, hex: oklchToHex(lch), exterior: true, interior: true, archived: false, ...extra },
        { brand, source: "file", sourceRef: `synthetic#${n}` },
      ),
    );
  };
  for (let h = 0; h < 360; h += hueStep) {
    for (const l of [0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.93]) {
      for (const c of [0.02, 0.05, 0.1, 0.15]) add({ l, c, h });
    }
  }
  for (const l of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.97, 1]) add({ l, c: 0, h: 0 });
  return rows;
}
