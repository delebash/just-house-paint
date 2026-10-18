// SPDX-License-Identifier: MIT
// The one paint row shape, and how each brand's colors are named on screen.
import { describe, expect, test } from "vitest";
import { BRANDS, dedupeByCode, displayName, hexToRgb, normalizeHex, normalizeRow, pickFamily, rgbToHex, tidyName } from "../../src/paints/normalize.js";

const row = (brand, code, name) => ({ brand, code, name });

describe("displayName", () => {
  test.each([
    ["sherwin-williams", "9901", "Fixture Linen", "SW 9901 Fixture Linen"],
    ["behr", "ZZ1-01", "Fixture Sand", "ZZ1-01 Fixture Sand"],
    ["benjamin-moore", "ZZ-17", "Fixture Dove", "BM ZZ-17 Fixture Dove"],
    ["valspar", "9001-1A", "Fixture Meadow", "Valspar 9001-1A Fixture Meadow"],
    ["ppg-glidden", "PPG9999-1", "Fixture Peregrine", "PPG9999-1 Fixture Peregrine"],
    ["ppg-glidden", "9999-1", "Fixture Bare", "PPG9999-1 Fixture Bare"],
    ["hgtv-home", "9911", "Fixture Dune", "HGSW9911 Fixture Dune"],
    ["dutch-boy", "901-1DB", "Fixture Pearl", "Dutch Boy 901-1DB Fixture Pearl"],
  ])("%s %s", (brand, code, name, expected) => {
    expect(displayName(row(brand, code, name))).toBe(expected);
  });

  test("a row without a code shows its name; an unknown brand shows the bare code", () => {
    expect(displayName(row("benjamin-moore", null, "Only A Name"))).toBe("Only A Name");
    expect(displayName(row("someone-else", "X-1", "Thing"))).toBe("X-1 Thing");
  });

  test("the prefix table can be replaced (the app seeds it)", () => {
    const brands = { ...BRANDS, "dutch-boy": { label: "Dutch Boy", display: { prefix: "", sep: "" } } };
    expect(displayName(row("dutch-boy", "901-1DB", "Fixture Pearl"), brands)).toBe("901-1DB Fixture Pearl");
  });

  test("all seven launch brands are listed", () => {
    expect(Object.keys(BRANDS).sort()).toEqual(
      ["behr", "benjamin-moore", "dutch-boy", "hgtv-home", "ppg-glidden", "sherwin-williams", "valspar"].sort(),
    );
  });
});

describe("normalizeRow", () => {
  test("derives hex, rgb and D65 L*a*b* from rgb alone", () => {
    const r = normalizeRow({ code: "1", name: "x", rgb: [255, 255, 255] }, { brand: "behr", source: "file" });
    expect(r.hex).toBe("#ffffff");
    expect(r.rgb).toEqual([255, 255, 255]);
    expect(r.lab[0]).toBeCloseTo(100, 3);
    expect(r.lab[1]).toBeCloseTo(0, 3);
    expect(r.lab[2]).toBeCloseTo(0, 3);
  });

  test("the full shape, with nulls where the source says nothing", () => {
    const r = normalizeRow({ code: " 12 ", name: "  Two   Words ", hex: "ABCDEF" }, { brand: "valspar", source: "feed", sourceRef: "u#1" });
    expect(r).toEqual({
      brand: "valspar",
      code: "12",
      name: "Two Words",
      hex: "#abcdef",
      rgb: [171, 205, 239],
      lab: expect.any(Array),
      lrv: null,
      exterior: null,
      interior: null,
      family: null,
      collection: null,
      coordinating: [],
      archived: null,
      source: "feed",
      sourceRef: "u#1",
    });
  });

  test("hex wins over rgb when both are given", () => {
    const r = normalizeRow({ code: "1", name: "x", hex: "#102030", rgb: [1, 2, 3] }, { brand: "behr", source: "file" });
    expect(r.rgb).toEqual([16, 32, 48]);
  });

  test("an LRV of 0 or outside 0..100 is missing, not a value", () => {
    const mk = (lrv) => normalizeRow({ code: "1", name: "x", hex: "#808080", lrv }, { brand: "behr", source: "file" }).lrv;
    expect(mk(0)).toBeNull();
    expect(mk(-3)).toBeNull();
    expect(mk(140)).toBeNull();
    expect(mk("44")).toBe(44);
    expect(mk(81.25)).toBe(81.25);
  });

  test("throws without a color, or without both code and name", () => {
    expect(() => normalizeRow({ code: "1", name: "x" }, { brand: "behr", source: "file" })).toThrow(/no usable color/);
    expect(() => normalizeRow({ code: "1", name: "x", rgb: [256, 0, 0] }, { brand: "behr", source: "file" })).toThrow(/no usable color/);
    expect(() => normalizeRow({ hex: "#000000" }, { brand: "behr", source: "file" })).toThrow(/neither a code nor a name/);
  });
});

describe("helpers", () => {
  test("normalizeHex", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("d8a585")).toBe("#d8a585");
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });

  test("rgbToHex / hexToRgb round trip", () => {
    expect(rgbToHex([216, 165, 133])).toBe("#d8a585");
    expect(hexToRgb("#d8a585")).toEqual([216, 165, 133]);
    expect(rgbToHex([1, 2])).toBeNull();
  });

  test("tidyName title-cases names written all in capitals only", () => {
    expect(tidyName("PALE ECRU")).toBe("Pale Ecru");
    expect(tidyName("SALT-AND-PEPPER (NEW)")).toBe("Salt-And-Pepper (New)");
    expect(tidyName("McIntosh Red")).toBe("McIntosh Red");
  });

  test("pickFamily skips collection names mixed into family lists", () => {
    expect(pickFamily(["Living Well", "Blue"])).toBe("Blue");
    expect(pickFamily(["NA"])).toBeNull();
    expect(pickFamily("Marquee")).toBeNull();
    expect(pickFamily("Green")).toBe("Green");
  });

  test("dedupeByCode keeps the first of a repeated code, per brand, ignoring case", () => {
    const a = { brand: "behr", code: "ab-1" };
    const b = { brand: "behr", code: "AB-1" };
    const c = { brand: "valspar", code: "AB-1" };
    const d = { brand: "behr", code: null };
    expect(dedupeByCode([a, b, c, d, d])).toEqual([a, c, d, d]);
  });
});
