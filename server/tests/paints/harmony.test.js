// SPDX-License-Identifier: MIT
// Palette suggestions: every scheme's snapped paints must keep the exterior constraints.
import { describe, expect, test, vi } from "vitest";
import { deltaE2000, hexToOklch } from "../../src/paints/color.js";
import { loadFeed } from "../../src/paints/feeds.js";
import { HARMONY_DEFAULTS, SCHEME_KINDS, schemeTargets, schemesFromCoordinating, suggestSchemes } from "../../src/paints/harmony.js";
import { prismSherwin } from "./fixtures/feeds.js";
import { syntheticPalette } from "./fixtures/palette.js";

const paints = syntheticPalette();
const L = (row) => hexToOklch(row.hex).l;
const C = (row) => hexToOklch(row.hex).c;
const hueGap = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

function expectConstraints(scheme, t = HARMONY_DEFAULTS) {
  const { body, trim, accent } = scheme.roles;
  expect(scheme.complete).toBe(true);
  expect(new Set([body.paint, trim.paint, accent.paint]).size).toBe(3);
  expect(Math.abs(L(trim.paint) - L(body.paint))).toBeGreaterThanOrEqual(t.trimMinDeltaL);
  expect(C(accent.paint)).toBeGreaterThanOrEqual(t.accentMinChroma);
  expect(deltaE2000(accent.paint, body.paint)).toBeGreaterThanOrEqual(t.accentMinDeltaE);
}

describe("suggestSchemes", () => {
  test.each(["#788e99", "#b5651d", "#3b5b3a", "#e8dcc4", "#6a2e35", "#2f3e5c"])("all five kinds hold their constraints for %s", (base) => {
    const schemes = suggestSchemes(base, paints);
    expect(schemes.map((s) => s.kind)).toEqual(SCHEME_KINDS);
    for (const s of schemes) {
      expectConstraints(s);
      for (const role of Object.values(s.roles)) {
        expect(role.target).toMatch(/^#[0-9a-f]{6}$/);
        expect(paints).toContain(role.paint);
        expect(role.deltaE).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("the scheme hues: complementary accent opposite, monochrome on the base hue", () => {
    const base = "#2f5d8a"; // a clear blue
    const h = hexToOklch(base).h;
    const [comp, , , mono] = suggestSchemes(base, paints);
    expect(hueGap(hexToOklch(comp.roles.accent.target).h, h + 180)).toBeLessThan(5);
    expect(hueGap(hexToOklch(comp.roles.accent.paint.hex).h, h + 180)).toBeLessThan(30);
    expect(hueGap(hexToOklch(mono.roles.accent.paint.hex).h, h)).toBeLessThan(30);
  });

  test("classic: a mid body, light trim, a darker accent", () => {
    const t = HARMONY_DEFAULTS;
    for (const base of ["#f4f1ea", "#1c1c1c", "#788e99"]) {
      const classic = suggestSchemes(base, paints, { kinds: ["classic"] })[0];
      const { body, trim, accent } = classic.roles;
      expect(L(body.paint)).toBeGreaterThan(t.classicBodyMinL - 0.06);
      expect(L(body.paint)).toBeLessThan(t.classicBodyMaxL + 0.06);
      expect(L(trim.paint)).toBeGreaterThan(L(body.paint));
      expect(L(accent.paint)).toBeLessThan(L(body.paint));
      expectConstraints(classic);
    }
  });

  test("classic: the door is a traditional door color, never the body's flip", () => {
    const paints = syntheticPalette({ brand: "behr" });
    const door = (bodyHex, opts = {}) => hexToOklch(suggestSchemes(bodyHex, paints, { kinds: ["classic"], ...opts })[0].roles.accent.target).h;
    // a green body gets brick red, not purple; a red body gets navy (red is too close)
    expect(hueGap(door("#5a7a52"), 25)).toBeLessThan(10);
    expect(hueGap(door("#9b3a2e"), 255)).toBeLessThan(10);
    // the list is data: a saved setting without it falls back to the default list
    expect(hueGap(door("#5a7a52", { classicAccentHues: [] }), 25)).toBeLessThan(10);
    expect(hueGap(door("#5a7a52", { classicAccentHues: [150, 255] }), 255)).toBeLessThan(10);
  });

  test("a hue-less base: the hue schemes are skipped with a reason; classic gets the set accent hue", () => {
    const schemes = suggestSchemes("#808080", paints);
    for (const s of schemes.slice(0, 4)) {
      expect(s.roles).toBeNull();
      expect(s.complete).toBe(false);
      expect(s.notes[0]).toMatch(/no hue/);
    }
    const classic = schemes[4];
    // the target is rounded to an 8-bit hex after gamut mapping, which moves a dark color's hue a little
    expect(hueGap(hexToOklch(classic.roles.accent.target).h, HARMONY_DEFAULTS.achromaticAccentHue)).toBeLessThan(10);
    const blue = suggestSchemes("#808080", paints, { kinds: ["classic"], achromaticAccentHue: 250 })[0];
    expect(hueGap(hexToOklch(blue.roles.accent.target).h, 250)).toBeLessThan(10);
  });

  test("every threshold is a parameter: a stricter trim contrast is honoured or the trim is left empty", () => {
    const strict = { trimMinDeltaL: 0.4, trimTargetDeltaL: 0.45 };
    const schemes = suggestSchemes("#8a7f6a", paints, strict);
    for (const s of schemes) {
      if (s.roles.trim.paint) expect(Math.abs(L(s.roles.trim.paint) - L(s.roles.body.paint))).toBeGreaterThanOrEqual(0.4);
      else expect(s.notes).toContain("no paint near the trim target is light or dark enough against the body");
    }
    expect(schemes.filter((s) => s.roles.trim.paint).length).toBeGreaterThanOrEqual(4);
  });

  test("an impossible constraint leaves the role empty with a note instead of breaking it", () => {
    const [s] = suggestSchemes("#788e99", paints, { kinds: ["complementary"], accentMinChroma: 0.9 });
    expect(s.complete).toBe(false);
    expect(s.roles.accent.paint).toBeNull();
    expect(s.notes).toEqual([expect.stringMatching(/accent/)]);
  });

  test("only the chosen brand, never interior-only or archived paints", () => {
    const blocked = paints.map((p, i) => (i % 3 === 0 ? { ...p, exterior: false } : i % 3 === 1 ? { ...p, archived: true } : p));
    const other = syntheticPalette({ brand: "behr", hueStep: 30 });
    for (const s of suggestSchemes("#788e99", [...blocked, ...other], { brand: "sherwin-williams" })) {
      for (const r of Object.values(s.roles)) {
        if (!r.paint) continue;
        expect(r.paint.brand).toBe("sherwin-williams");
        expect(r.paint.exterior).not.toBe(false);
        expect(r.paint.archived).not.toBe(true);
      }
    }
  });

  test("a paint row as the base is the body itself (classic may move it to a mid lightness)", () => {
    const row = paints.find((p) => p.code === "T-200");
    const schemes = suggestSchemes(row, paints);
    for (const s of schemes.slice(0, 4)) expect(s.roles.body).toEqual({ target: row.hex, paint: row, deltaE: 0 });
  });

  test("bad input", () => {
    expect(() => suggestSchemes("not a color", paints)).toThrow(TypeError);
    expect(() => schemeTargets("pastel", hexToOklch("#788e99"), HARMONY_DEFAULTS)).toThrow(/unknown scheme kind/);
    expect(suggestSchemes("#788e99", [])[0]).toMatchObject({ roles: null, notes: [expect.stringMatching(/no paint/)] });
  });
});

describe("schemesFromCoordinating", () => {
  async function swRows() {
    const fetch = vi.fn(async () => new Response(JSON.stringify(prismSherwin), { status: 200 }));
    return loadFeed("sherwin-williams", { fetch });
  }

  test("the brand's own coordinating colors, the best pairing first", async () => {
    const rows = await swRows();
    const slate = rows.find((r) => r.code === "9902");
    const schemes = schemesFromCoordinating(slate, rows);
    expect(schemes.length).toBeGreaterThan(0);
    expect(schemes.length).toBeLessThanOrEqual(HARMONY_DEFAULTS.coordinatingMaxSchemes);
    const best = schemes[0];
    expect(best.kind).toBe("coordinating");
    expect(best.roles.body.paint).toBe(slate);
    expect(best.roles.trim.paint.code).toBe("9904"); // the matching white: the largest lightness step
    expect(best.roles.accent.paint.code).toBe("9903"); // the brick: the colorful one
    expect(best.complete).toBe(true);
    expectConstraints(best);
  });

  test("coordinating colors that are interior-only or archived are left out", async () => {
    const rows = await swRows();
    const linen = { ...rows[0], coordinating: ["9905", "9903"] }; // 9905 is interior-only and archived
    const schemes = schemesFromCoordinating(linen, rows);
    expect(schemes.every((s) => s.roles.trim.paint.code !== "9905" && s.roles.accent.paint?.code !== "9905")).toBe(true);
    expect(schemes[0].roles.accent.paint).toBeNull();
    expect(schemes[0].notes).toContain("the brand lists no further coordinating color for the accent");
    // the body and the trim the brand pairs are still the brand's pairing: it applies, the door as it is
    expect(schemes[0].complete).toBe(true);
  });

  test("the brand's pairing applies as the brand made it; what the app's rules found is a note, never a block", async () => {
    // 2026-10-28: with the harmony rules deciding, 1,654 of Sherwin-Williams' 1,746 colors with pairings had none to
    // apply (1,643 for the accent — the brands pair a color with soft neutrals): a pairing whose accent is a quiet
    // neutral is still the brand's own
    const rows = await swRows();
    const slate = rows.find((r) => r.code === "9902");
    const white = rows.find((r) => r.code === "9904");
    const greige = { ...white, id: "sherwin-williams:9990", code: "9990", name: "Greige", hex: "#9a9488" };
    const body = { ...slate, coordinating: ["9904", "9990"] };
    const [best] = schemesFromCoordinating(body, [...rows, greige]);
    expect(best.roles.trim.paint.code).toBe("9904");
    expect(best.roles.accent.paint.code).toBe("9990");
    expect(best.notes).toContain("the accent is not colorful or distinct enough");
    expect(best.complete).toBe(true);
  });

  test("no coordinating colors → no schemes", async () => {
    const rows = await swRows();
    expect(schemesFromCoordinating(rows.find((r) => r.code === "9904"), rows)).toEqual([]);
  });

  test("the limit is a parameter", async () => {
    const rows = await swRows();
    expect(schemesFromCoordinating(rows[1], rows, { coordinatingMaxSchemes: 1 })).toHaveLength(1);
  });
});
