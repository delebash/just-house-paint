// SPDX-License-Identifier: MIT
// Official-file imports (option C), from SYNTHETIC files built in memory in each format's layout.
import writeExcelFile from "write-excel-file/node";
import { describe, expect, test } from "vitest";
import { detectFormat, importFile, mapHeader, splitLabel } from "../../src/paints/importers.js";
import { parseAco, parseAse } from "../../src/paints/swatches.js";
import { writeAco, writeAse } from "./fixtures/swatch-writers.js";

const rgb01 = (r, g, b) => [r / 255, g / 255, b / 255];

describe("splitLabel", () => {
  test.each([
    ["001 Fixture Powderpuff", undefined, { code: "001", name: "Fixture Powderpuff" }],
    ["ZZ-17 Fixture Dove", undefined, { code: "ZZ-17", name: "Fixture Dove" }],
    ["PPG9993-1 FIXTURE PEREGRINE", undefined, { code: "PPG9993-1", name: "FIXTURE PEREGRINE" }],
    ["Fixture Linen 9901-2B", undefined, { code: "9901-2B", name: "Fixture Linen" }],
    ["SW 9901 Fixture Linen", "sherwin-williams", { code: "9901", name: "Fixture Linen" }],
    ["HGSW9911 Fixture Dune", "hgtv-home", { code: "9911", name: "Fixture Dune" }],
    ["Just A Name", undefined, { code: null, name: "Just A Name" }],
    ["ZZ-99", undefined, { code: "ZZ-99", name: "" }],
  ])("%s", (label, brand, expected) => {
    expect(splitLabel(label, { brand })).toEqual(expected);
  });
});

describe(".ase", () => {
  const file = writeAse(
    [
      {
        swatches: [
          { name: "001 Fixture Powderpuff", model: "RGB", values: rgb01(255, 213, 204) },
          { name: "002 Fixture Vacation", model: "RGB", values: rgb01(250, 200, 160), type: 0 },
        ],
      },
      {
        group: "Invented Collection",
        swatches: [
          { name: "ZZ-17 Fixture Dove", model: "LAB", values: [0.95, 0, 2] },
          { name: "ZZ-18 Fixture Print", model: "CMYK", values: [0, 1, 1, 0] },
          { name: "ZZ-19 Fixture Gray", model: "Gray", values: [0.5] },
        ],
      },
    ],
    { emptyGroupHeader: true },
  );

  test("parseAse reads RGB and Lab, keeps the group, skips CMYK and Gray with warnings", () => {
    const { swatches, warnings } = parseAse(file);
    expect(swatches.map((s) => [s.name, s.group, s.model, s.hex])).toEqual([
      ["001 Fixture Powderpuff", null, "RGB", "#ffd5cc"],
      ["002 Fixture Vacation", null, "RGB", "#fac8a0"],
      ["ZZ-17 Fixture Dove", "Invented Collection", "LAB", expect.stringMatching(/^#f[0-9a-f]{5}$/)],
    ]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/CMYK/);
  });

  test("importFile turns swatches into rows, the group as the collection", async () => {
    const { format, rows, warnings } = await importFile(file, "bm_invented.ase", { brand: "benjamin-moore" });
    expect(format).toBe("ase");
    expect(warnings).toHaveLength(2);
    expect(rows.map((r) => [r.code, r.name, r.collection])).toEqual([
      ["001", "Fixture Powderpuff", null],
      ["002", "Fixture Vacation", null],
      ["ZZ-17", "Fixture Dove", "Invented Collection"],
    ]);
    expect(rows[0]).toMatchObject({ brand: "benjamin-moore", hex: "#ffd5cc", lrv: null, exterior: null, source: "file", sourceRef: "bm_invented.ase#1" });
  });

  test("Lab lightness written 0..100 (GIMP) reads the same as Adobe's 0..1", () => {
    const adobe = parseAse(writeAse([{ swatches: [{ name: "a", model: "LAB", values: [0.62, 10, -20] }] }])).swatches[0].hex;
    const gimp = parseAse(writeAse([{ swatches: [{ name: "a", model: "LAB", values: [62, 10, -20] }] }])).swatches[0].hex;
    expect(gimp).toBe(adobe);
  });

  test("a truncated file stops with a warning instead of throwing", () => {
    const { swatches, warnings } = parseAse(file.subarray(0, file.length - 10));
    expect(swatches.length).toBeGreaterThan(0);
    expect(warnings.some((w) => /past the end/.test(w))).toBe(true);
  });

  test("not an ASE file", () => {
    expect(() => parseAse(Buffer.from("PK\u0003\u0004"))).toThrow(/ASEF/);
  });
});

describe(".aco", () => {
  const colors = [
    { name: "PPG9993-1 FIXTURE PEREGRINE", space: 0, values: [213 * 257, 216 * 257, 217 * 257] },
    { name: "PPG9993-2 FIXTURE TRAIN", space: 7, values: [5000, -2000, 3000] },
    { name: "PPG9993-3 FIXTURE RED", space: 1, values: [0, 65535, 65535] },
    { name: "PPG9993-4 FIXTURE INK", space: 2, values: [0, 65535, 65535] },
  ];

  test("prefers the named version 2 list; RGB, Lab and HSB read, CMYK skipped", () => {
    const { swatches, warnings } = parseAco(writeAco(colors));
    expect(swatches.map((s) => [s.name, s.model])).toEqual([
      ["PPG9993-1 FIXTURE PEREGRINE", "RGB"],
      ["PPG9993-2 FIXTURE TRAIN", "LAB"],
      ["PPG9993-3 FIXTURE RED", "HSB"],
    ]);
    expect(swatches[0].hex).toBe("#d5d8d9");
    expect(swatches[2].hex).toBe("#ff0000");
    expect(warnings).toEqual([expect.stringMatching(/FIXTURE INK.*CMYK/)]);
  });

  test("a version 1 file alone has colors but no names", () => {
    const { swatches } = parseAco(writeAco(colors, { v2: false }));
    expect(swatches.map((s) => s.name)).toEqual(["", "", ""]);
  });

  test("importFile: codes split off, capitals title-cased", async () => {
    const { format, rows } = await importFile(writeAco(colors), "voc_invented.aco", { brand: "ppg-glidden" });
    expect(format).toBe("aco");
    expect(rows.map((r) => [r.code, r.name])).toEqual([
      ["PPG9993-1", "Fixture Peregrine"],
      ["PPG9993-2", "Fixture Train"],
      ["PPG9993-3", "Fixture Red"],
    ]);
  });
});

describe(".xlsx", () => {
  test("PPG/Glidden's layout: R, G, B and LRV columns, no hex", async () => {
    const sheet = [
      ["Color Number", "Color Name", "R", "G", "B", "LRV", "Swatch"],
      ["PPG9993-1", "FIXTURE PEREGRINE", 213, 216, 217, 68, null],
      ["PPG9993-2", "FIXTURE TRAIN", 191, 195, 198, 54, null],
      ["PPG9993-3", "FIXTURE BROKEN", 300, 0, 0, 10, null],
      ["PPG9993-1", "FIXTURE DUPLICATE", 1, 2, 3, 4, null],
    ];
    const buffer = await writeExcelFile(sheet).toBuffer();
    const { format, rows, warnings } = await importFile(buffer, "voc_invented.xlsx", { brand: "ppg-glidden" });
    expect(format).toBe("xlsx");
    expect(rows.map((r) => [r.code, r.name, r.hex, r.lrv])).toEqual([
      ["PPG9993-1", "Fixture Peregrine", "#d5d8d9", 68],
      ["PPG9993-2", "Fixture Train", "#bfc3c6", 54],
    ]);
    expect(rows[0].sourceRef).toBe("voc_invented.xlsx [Sheet1]#row2");
    expect(warnings).toEqual([expect.stringMatching(/^row 4: .*no usable color/), "1 repeated codes dropped"]);
  });

  test("title rows above the header are skipped; a hex column works too", async () => {
    const sheet = [
      ["Invented Brand — color list"],
      [],
      ["Name", "Number", "Hex", "Exterior", "Family"],
      ["Fixture Fern", "ZZ-1", "#4f7942", "Yes", "Green"],
      ["Fixture Fog", "ZZ-2", "C8CCD0", "no", "Gray"],
    ];
    const { rows } = await importFile(await writeExcelFile(sheet).toBuffer(), "x.xlsx", { brand: "benjamin-moore" });
    expect(rows.map((r) => [r.code, r.name, r.hex, r.exterior, r.family])).toEqual([
      ["ZZ-1", "Fixture Fern", "#4f7942", true, "Green"],
      ["ZZ-2", "Fixture Fog", "#c8ccd0", false, "Gray"],
    ]);
  });

  test("a workbook without a usable header row", async () => {
    const buffer = await writeExcelFile([["just"], ["text"]]).toBuffer();
    await expect(importFile(buffer, "x.xlsx", { brand: "behr" })).rejects.toThrow(/no header row/);
  });
});

describe(".csv", () => {
  test("headers mapped by name; one 'r,g,b' column; booleans; quoted commas", async () => {
    const csv = [
      "﻿Colour Name,Colour Code,RGB,LRV,Interior,Collection",
      '"Fixture Wheat, Pale",ZZ-31,"245, 222, 179",72,TRUE,Invented',
      "Fixture Night,ZZ-32,20 24 40,2,false,",
      ",,,,,",
    ].join("\r\n");
    const { format, rows, warnings } = await importFile(Buffer.from(csv), "list.csv", { brand: "valspar" });
    expect(format).toBe("csv");
    expect(warnings).toEqual([]);
    expect(rows.map((r) => [r.code, r.name, r.hex, r.lrv, r.interior, r.collection])).toEqual([
      ["ZZ-31", "Fixture Wheat, Pale", "#f5deb3", 72, true, "Invented"],
      ["ZZ-32", "Fixture Night", "#141828", 2, false, null],
    ]);
  });

  test("an explicit mapping names columns the aliases don't know", async () => {
    const csv = "Paint,Ref,Swatch Hex\nFixture Teal,ZZ-40,#008080\n";
    const { rows } = await importFile(Buffer.from(csv), "odd.csv", {
      brand: "behr",
      mapping: { name: "Paint", code: "Ref", hex: "Swatch Hex" },
    });
    expect(rows[0]).toMatchObject({ code: "ZZ-40", name: "Fixture Teal", hex: "#008080" });
  });

  test("mapHeader", () => {
    expect(mapHeader(["Color Number", "Color Name", "R", "G", "B", "LRV"])).toEqual({ code: 0, name: 1, r: 2, g: 3, b: 4, lrv: 5 });
  });
});

describe("detectFormat and errors", () => {
  test("by extension, else by the first bytes", async () => {
    expect(detectFormat(Buffer.alloc(0), "a.CSV")).toBe("csv");
    expect(detectFormat(writeAse([{ swatches: [] }]), "download")).toBe("ase");
    expect(detectFormat(writeAco([{ name: "x", space: 0, values: [0, 0, 0] }]), "download")).toBe("aco");
    expect(detectFormat(await writeExcelFile([["a"]]).toBuffer(), "download")).toBe("xlsx");
    expect(detectFormat(Buffer.from("hello world"), "notes.txt")).toBeNull();
  });

  test("an unknown format or a missing brand", async () => {
    await expect(importFile(Buffer.from("hello"), "notes.txt", { brand: "behr" })).rejects.toThrow(/not a format/);
    await expect(importFile(Buffer.from("a,b"), "x.csv", {})).rejects.toThrow(/brand/);
  });

  test("an ArrayBuffer or a Uint8Array view works as well as a Buffer", async () => {
    const csv = Buffer.from("name,code,hex\nFixture A,ZZ-1,#112233\n");
    const view = new Uint8Array(csv.buffer, csv.byteOffset, csv.byteLength);
    const ab = csv.buffer.slice(csv.byteOffset, csv.byteOffset + csv.byteLength);
    expect((await importFile(view, "a.csv", { brand: "behr" })).rows).toHaveLength(1);
    expect((await importFile(ab, "a.csv", { brand: "behr" })).rows).toHaveLength(1);
  });
});
