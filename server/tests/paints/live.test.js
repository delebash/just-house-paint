// SPDX-License-Identifier: MIT
// Opt-in checks against the real sources — nothing here runs by default, and nothing is saved.
//   HP_LIVE_FEEDS=1  each public list loads and has the expected shape
//   HP_LIVE_FILES=1  the official Benjamin Moore and PPG/Glidden files import (held in memory only)
// The counts are floors, not exact: the brands add and retire colors.
import { describe, expect, test } from "vitest";
import { deltaE2000 } from "../../src/paints/color.js";
import { BRAND_FEEDS, loadFeed } from "../../src/paints/feeds.js";
import { importFile } from "../../src/paints/importers.js";
import { displayName } from "../../src/paints/normalize.js";

const LIVE_FEEDS = process.env.HP_LIVE_FEEDS === "1";
const LIVE_FILES = process.env.HP_LIVE_FILES === "1";

function expectRowShape(rows, brand, source) {
  const codes = new Set();
  for (const r of rows) {
    expect(r.brand).toBe(brand);
    expect(r.source).toBe(source);
    expect(r.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(r.rgb).toHaveLength(3);
    expect(r.lab).toHaveLength(3);
    expect(r.name.length).toBeGreaterThan(0);
    expect(r.code?.length).toBeGreaterThan(0);
    expect(codes.has(r.code)).toBe(false);
    codes.add(r.code);
  }
}

const share = (rows, f) => rows.filter(f).length / rows.length;

describe.skipIf(!LIVE_FEEDS)("live public lists", () => {
  const cache = new Map();
  const load = (brand) => loadFeed(brand, { fetch: globalThis.fetch, cache });

  test("Sherwin-Williams: exterior flags, LRV, coordinating colors", async () => {
    const rows = await load("sherwin-williams");
    expect(rows.length).toBeGreaterThan(1500);
    expectRowShape(rows, "sherwin-williams", "feed");
    expect(rows.every((r) => typeof r.exterior === "boolean" && typeof r.interior === "boolean")).toBe(true);
    expect(share(rows, (r) => r.lrv !== null)).toBeGreaterThan(0.95);
    expect(share(rows, (r) => r.coordinating.length > 0)).toBeGreaterThan(0.5);
    expect(displayName(rows[0])).toMatch(/^SW \d{4} \S/);
  });

  test.each([
    ["valspar", 1000, /^Valspar \S+ \S/],
    ["hgtv-home", 500, /^HGSW\d{4} \S/],
    ["dutch-boy", 1000, /^Dutch Boy \S+ \S/],
  ])("%s: LRV present, exterior unknown", async (brand, floor, nameShape) => {
    const rows = await load(brand);
    expect(rows.length).toBeGreaterThan(floor);
    expectRowShape(rows, brand, "feed");
    expect(rows.every((r) => r.exterior === null)).toBe(true);
    expect(share(rows, (r) => r.lrv !== null)).toBeGreaterThan(0.95);
    expect(share(rows, (r) => r.coordinating.length > 0)).toBeGreaterThan(0.5);
    expect(displayName(rows[0])).toMatch(nameShape);
  });

  test("Behr: LRV and archived flags; no exterior flags or coordinating colors", async () => {
    const rows = await load("behr");
    expect(rows.length).toBeGreaterThan(2000);
    expectRowShape(rows, "behr", "feed");
    expect(share(rows, (r) => r.lrv !== null)).toBeGreaterThan(0.95);
    expect(rows.every((r) => typeof r.archived === "boolean")).toBe(true);
    expect(rows.every((r) => r.exterior === null && r.coordinating.length === 0)).toBe(true);
  });

  test("Valspar and HGTV Home shared one download", () => {
    expect([...cache.keys()].sort()).toEqual([...new Set(BRAND_FEEDS.map((f) => f.url))].sort());
  });
});

// The official downloads, as linked from the brands' designer pages on 2026-10-17.
const OFFICIAL = {
  bmClassics:
    "https://www.benjaminmoore.com/-/media/sites/benjaminmoore/files/palettedownloads/ase/en-us/benjaminmoore_classiccolors_en-us.ase",
  ppgXlsx:
    "https://cdn.prod.website-files.com/68c227d44a699278f2b6512f/6a1ec9f28fe34bfce535299b_PPG-Voice-of-Colour-Palette_RGB-and-LRV-Values-2025.xlsx",
  ppgAse: "https://sttageus2prd001.blob.core.windows.net/tag/other/VOC_2020_NumberSort.ase",
  ppgAco: "https://sttageus2prd001.blob.core.windows.net/tag/other/VOC_2020_NumberSort.aco",
};

async function download(url) {
  const res = await fetch(url);
  expect(res.status).toBe(200);
  return Buffer.from(await res.arrayBuffer());
}

describe.skipIf(!LIVE_FILES)("live official files (in memory)", () => {
  test("Benjamin Moore Classics .ase", async () => {
    const { format, rows, warnings } = await importFile(await download(OFFICIAL.bmClassics), "benjaminmoore_classiccolors_en-us.ase", {
      brand: "benjamin-moore",
    });
    expect(format).toBe("ase");
    expect(warnings).toEqual([]);
    expect(rows.length).toBeGreaterThan(1000);
    expectRowShape(rows, "benjamin-moore", "file");
    expect(displayName(rows[0])).toMatch(/^BM \S+ \S/);
  });

  // The ASE and ACO (2020) hold identical colors; the XLSX (2025) has the same codes with revised
  // RGB values (2026-10-17: 158 of 2,108 identical, mean ΔE2000 1.24, max 19.8) — prefer the XLSX.
  test("PPG/Glidden: the ASE and ACO agree exactly; the newer XLSX has the same codes", async () => {
    const [x, a, o] = await Promise.all([
      download(OFFICIAL.ppgXlsx).then((b) => importFile(b, "ppg.xlsx", { brand: "ppg-glidden" })),
      download(OFFICIAL.ppgAse).then((b) => importFile(b, "ppg.ase", { brand: "ppg-glidden" })),
      download(OFFICIAL.ppgAco).then((b) => importFile(b, "ppg.aco", { brand: "ppg-glidden" })),
    ]);
    for (const f of [x, a, o]) {
      expect(f.rows.length).toBeGreaterThan(2000);
      expectRowShape(f.rows, "ppg-glidden", "file");
    }
    expect(x.rows.every((r) => r.lrv !== null && r.code.startsWith("PPG"))).toBe(true);
    const byCode = (f) => new Map(f.rows.map((r) => [r.code, r]));
    const [mx, ma, mo] = [byCode(x), byCode(a), byCode(o)];
    expect([...ma].every(([code, r]) => mo.get(code)?.hex === r.hex)).toBe(true);
    expect([...mx.keys()].every((code) => ma.has(code))).toBe(true);
    const meanDe = [...mx].reduce((s, [code, r]) => s + deltaE2000(r, ma.get(code)), 0) / mx.size;
    expect(meanDe).toBeLessThan(3);
  });
});
