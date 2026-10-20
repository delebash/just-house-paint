// SPDX-License-Identifier: MIT
// The color card's layout: the photo on top, one row per painted part under the title, the note
// last — sizes from the photo's width, so a small photo still gets readable text.
import { expect, test } from "vitest";
import { clipText, colorCardLayout } from "./colorCard.js";

test("rows follow the title in order, the note follows the rows, the card ends after the note", () => {
  const L = colorCardLayout({ width: 2048, height: 1536, rows: [{}, {}, {}] });
  expect(L.font).toBe(37);
  expect(L.titleY).toBeGreaterThan(1536);
  expect(L.rowBoxes.map((r) => r.y)).toEqual([L.rowBoxes[0].y, L.rowBoxes[0].y + L.rowH, L.rowBoxes[0].y + 2 * L.rowH]);
  expect(L.rowBoxes[0].y).toBeGreaterThan(L.subtitleY);
  expect(L.noteY).toBeGreaterThan(L.rowBoxes[2].y + L.rowH - 1);
  expect(L.height).toBeGreaterThan(L.noteY);
  // every swatch sits inside its row
  for (const r of L.rowBoxes) {
    expect(r.swatchY).toBeGreaterThanOrEqual(r.y);
    expect(r.swatchY + L.swatch).toBeLessThanOrEqual(r.y + L.rowH);
  }
});

test("a small photo keeps a readable text size; no rows still makes a card", () => {
  expect(colorCardLayout({ width: 300, height: 200, rows: [] }).font).toBe(14);
  const empty = colorCardLayout({ width: 1000, height: 500, rows: [] });
  expect(empty.rowBoxes).toEqual([]);
  expect(empty.height).toBeGreaterThan(500);
});

test("a long name is cut with an ellipsis between characters as a person sees them — never inside an emoji", () => {
  // a measure of one unit a UTF-16 code unit: the cut by unit left an emoji's first half before the "…"
  const ctx = { measureText: (s) => ({ width: s.length }) };
  const clipped = clipText(ctx, "Our 🏠 home", 6);
  expect(clipped).toBe("Our …");
  expect(clipped.isWellFormed()).toBe(true);
  // a family emoji (8 units, joined by ZWJs) is kept whole or not at all
  expect(clipText(ctx, "Ab👨‍👩‍👧 the house", 11)).toBe("Ab👨‍👩‍👧…");
  expect(clipText(ctx, "Ab👨‍👩‍👧 the house", 9)).toBe("Ab…");
  // a name that fits is left as it is
  expect(clipText(ctx, "Main street", 20)).toBe("Main street");
});
