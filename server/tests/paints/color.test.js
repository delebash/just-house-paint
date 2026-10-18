// SPDX-License-Identifier: MIT
// Conversions, CIEDE2000 against the published test data, nearest real paints, contrast and LRV.
import { describe, expect, test } from "vitest";
import {
  contrastRatio,
  deltaE2000,
  eligiblePaints,
  estimateLrv,
  hexToLab,
  hexToOklab,
  hexToOklch,
  labToHex,
  lrvDifference,
  lrvOf,
  nearestPaints,
  oklchToHex,
} from "../../src/paints/color.js";
import { syntheticPalette } from "./fixtures/palette.js";

describe("deltaE2000", () => {
  // Sharma, Wu & Dalal (2005), "The CIEDE2000 Color-Difference Formula: Implementation Notes,
  // Supplementary Test Data, and Mathematical Observations", Table 1 — pairs 1, 2, 3, 7, 17, 18,
  // 25 and 34.
  test.each([
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [61, -5, 29], 22.8977],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ])("%j vs %j = %d", (a, b, expected) => {
    expect(deltaE2000(a, b)).toBeCloseTo(expected, 4);
  });

  test("accepts hex strings and rows, and is 0 for the same color", () => {
    expect(deltaE2000("#ebe7dd", "#EBE7DD")).toBe(0);
    expect(deltaE2000({ lab: hexToLab("#336699") }, "#336699")).toBeCloseTo(0, 10);
    expect(deltaE2000("#000000", "#ffffff")).toBeCloseTo(100, 1);
  });
});

describe("conversions", () => {
  test("hex ↔ L*a*b* (D65) round trip", () => {
    for (const hex of ["#ebe7dd", "#12466b", "#b24f7c", "#000000", "#ffffff"]) {
      expect(labToHex(hexToLab(hex))).toBe(hex);
    }
  });

  test("D65 white is L 100, a 0, b 0", () => {
    const [l, a, b] = hexToLab("#ffffff");
    expect(l).toBeCloseTo(100, 3);
    expect(a).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
  });

  test("OKLab / OKLCH, and gamut mapping of out-of-range OKLCH", () => {
    expect(hexToOklab("#ffffff")[0]).toBeCloseTo(1, 4);
    const lch = hexToOklch("#b24f7c");
    expect(oklchToHex(lch)).toBe("#b24f7c");
    expect(hexToOklch("#808080").c).toBeLessThan(1e-4);
    expect(oklchToHex({ l: 0.7, c: 0.5, h: 150 })).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("nearestPaints", () => {
  const paints = syntheticPalette();

  test("matches a brute-force CIEDE2000 ranking", () => {
    for (const target of ["#788e99", "#d8a585", "#2b2b2b", "#f2e8ea", "#5a8f3c"]) {
      const brute = paints
        .map((p) => ({ p, d: deltaE2000(target, p) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 5)
        .map((x) => x.p.code);
      expect(nearestPaints(target, paints, { k: 5 }).map((x) => x.paint.code)).toEqual(brute);
    }
  });

  test("returns k results nearest first, with ΔE", () => {
    const out = nearestPaints("#788e99", paints, { k: 7 });
    expect(out).toHaveLength(7);
    for (let i = 1; i < out.length; i++) expect(out[i].deltaE).toBeGreaterThanOrEqual(out[i - 1].deltaE);
    expect(out[0].paint.code).toMatch(/^T-/);
  });

  test("an exact paint comes back with ΔE 0", () => {
    const p = paints[123];
    expect(nearestPaints(p.hex, paints, { k: 1 })[0]).toEqual({ paint: p, deltaE: 0 });
  });

  test("brand, exterior-only and archived filters", () => {
    const other = syntheticPalette({ brand: "behr", hueStep: 90 });
    const mixed = [...paints, ...other];
    expect(nearestPaints("#788e99", mixed, { k: 10, brand: "behr" }).every((x) => x.paint.brand === "behr")).toBe(true);

    const target = paints[50];
    const interiorOnly = { ...target, code: "INT", exterior: false };
    const unknown = { ...target, code: "UNK", exterior: null };
    const archived = { ...target, code: "OLD", archived: true };
    const list = [interiorOnly, unknown, archived];
    expect(nearestPaints(target.hex, list, { k: 3 }).map((x) => x.paint.code)).toEqual(["INT", "UNK"]);
    expect(nearestPaints(target.hex, list, { k: 3, exteriorOnly: true }).map((x) => x.paint.code)).toEqual(["UNK"]);
    expect(nearestPaints(target.hex, list, { k: 3, includeArchived: true }).map((x) => x.paint.code)).toEqual(["INT", "UNK", "OLD"]);
    expect(eligiblePaints(list, { exteriorOnly: true, includeArchived: true }).map((p) => p.code)).toEqual(["UNK", "OLD"]);
  });

  test("an empty list gives no results", () => {
    expect(nearestPaints("#ffffff", [])).toEqual([]);
  });

  test("is fast enough for a brand's whole list (5,000 rows)", () => {
    const big = [...syntheticPalette({ hueStep: 3 }), ...syntheticPalette({ hueStep: 7.5 })];
    expect(big.length).toBeGreaterThan(5000);
    nearestPaints("#336699", big); // warms the OKLab cache, as the server's long-lived list would
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) nearestPaints(`#${(i * 123457).toString(16).padStart(6, "0").slice(-6)}`, big);
    const per = (performance.now() - t0) / 20;
    expect(per).toBeLessThan(25);
  });
});

describe("contrast and LRV", () => {
  test("WCAG contrast ratio", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 6);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  test("LRV: the brand's when given, else CIE Y × 100", () => {
    expect(estimateLrv("#ffffff")).toBeCloseTo(100, 6);
    expect(estimateLrv("#000000")).toBe(0);
    expect(estimateLrv("#777777")).toBeCloseTo(18.4, 1);
    expect(lrvOf({ hex: "#777777", lrv: 20 })).toBe(20);
    expect(lrvOf({ hex: "#777777", lrv: null })).toBeCloseTo(18.4, 1);
    expect(lrvDifference({ hex: "#000000", lrv: 3 }, "#ffffff")).toBeCloseTo(97, 6);
  });
});
