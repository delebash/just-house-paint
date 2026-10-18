// SPDX-License-Identifier: MIT
// SYNTHETIC fixtures: invented colors in the field shapes the public lists returned on
// 2026-10-17. No row here is a real brand color — names, numbers and values are made up.

/** One row of api.sherwin-williams.com/prism/v1/colors/<brand>, with overrides. */
function prismRow(o) {
  return {
    colorNumber: o.colorNumber,
    coordinatingColors: o.coordinatingColors ?? {},
    description: ["Invented", "Test"],
    id: o.id,
    name: o.name,
    colorFamilyNames: o.colorFamilyNames ?? ["Neutral"],
    brandKey: o.brandKey,
    red: o.rgb[0],
    green: o.rgb[1],
    blue: o.rgb[2],
    hue: 0.1,
    saturation: 0.2,
    lightness: 0.5,
    hex: `#${o.rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`,
    isDark: o.rgb.reduce((a, b) => a + b, 0) < 384,
    similarColors: [],
    lab: { L: 50, A: 0, B: 0 }, // the parser derives L*a*b* from hex; this value is ignored
    ...o.extra,
  };
}

/** /colors/sherwin: SW rows with exterior flags, LRV, coordinating ids incl. a white, an ignore duplicate. */
export const prismSherwin = [
  prismRow({
    id: "91001",
    colorNumber: "9901",
    name: "Fixture Linen",
    brandKey: "SW",
    rgb: [236, 232, 220],
    colorFamilyNames: ["Designer Color Collection", "White & Pastel"],
    coordinatingColors: { coord1ColorId: "91002", coord2ColorId: "91003", whiteColorId: "91004" },
    extra: { isExterior: true, isInterior: true, lrv: 81.2, brandedCollectionNames: ["Invented Collection"], storeStripLocator: "999-C1", ignore: false, archived: false },
  }),
  prismRow({
    id: "91002",
    colorNumber: "9902",
    name: "Fixture Slate",
    brandKey: "SW",
    rgb: [92, 104, 112],
    colorFamilyNames: ["Blue"],
    coordinatingColors: { coord1ColorId: "91001", coord2ColorId: "91003", whiteColorId: "91004" },
    extra: { isExterior: true, isInterior: true, lrv: 13.4, brandedCollectionNames: [], storeStripLocator: "999-C2", ignore: false, archived: false },
  }),
  prismRow({
    id: "91003",
    colorNumber: "9903",
    name: "Fixture Brick",
    brandKey: "SW",
    rgb: [150, 52, 40],
    colorFamilyNames: ["Red"],
    coordinatingColors: { coord1ColorId: "91001", coord2ColorId: "91002", whiteColorId: "91004" },
    extra: { isExterior: true, isInterior: true, lrv: 9.1, brandedCollectionNames: [], ignore: false, archived: false },
  }),
  prismRow({
    id: "91004",
    colorNumber: "9904",
    name: "Fixture Snow",
    brandKey: "SW",
    rgb: [248, 247, 242],
    colorFamilyNames: ["White & Pastel"],
    extra: { isExterior: true, isInterior: true, lrv: 92, brandedCollectionNames: [], ignore: false, archived: false },
  }),
  prismRow({
    id: "91005",
    colorNumber: "9905",
    name: "Fixture Blush",
    brandKey: "SW",
    rgb: [230, 190, 200],
    colorFamilyNames: ["NA", "Red"],
    extra: { isExterior: false, isInterior: true, lrv: 58, brandedCollectionNames: [], ignore: false, archived: true },
  }),
  // The feed repeats some colors under a "bright-NNNN" id with ignore: true.
  prismRow({
    id: "bright-9901",
    colorNumber: "9901",
    name: "Fixture Linen",
    brandKey: "SW",
    rgb: [236, 232, 220],
    extra: { isExterior: true, isInterior: true, lrv: 81.2, brandedCollectionNames: [], ignore: true, archived: false },
  }),
];

/** /colors/lowes: Valspar rows (brandKey "") and HGTV Home rows ("HGSW"), LRV, ids that coordinating colors point at. */
export const prismLowes = [
  prismRow({
    id: "700001",
    colorNumber: "9001-1A",
    name: "Fixture Meadow",
    brandKey: "",
    rgb: [120, 150, 90],
    colorFamilyNames: ["Green"],
    coordinatingColors: { coord1ColorId: "700002", coord2ColorId: "700003", coord3ColorId: "9999" },
    extra: { lrv: 27, colorGroup: ["Invented Group"], column: "1", row: "1", archived: false },
  }),
  prismRow({
    id: "700002",
    colorNumber: "9001-2B",
    name: "Fixture Cloud",
    brandKey: "",
    rgb: [240, 240, 235],
    colorFamilyNames: ["White"],
    coordinatingColors: { coord1ColorId: "700001", coord2ColorId: "700003", coord3ColorId: "1001" },
    extra: { lrv: 86, colorGroup: ["Invented Group"], column: "1", row: "2", archived: false },
  }),
  prismRow({
    id: "700003",
    colorNumber: "9001-3C",
    name: "Fixture Plum",
    brandKey: "",
    rgb: [90, 40, 80],
    colorFamilyNames: ["Purple"],
    extra: { lrv: 6.5, colorGroup: ["Invented Group"], column: "1", row: "3", archived: false },
  }),
  prismRow({
    id: "1001",
    colorNumber: "9911",
    name: "Fixture Dune",
    brandKey: "HGSW",
    rgb: [200, 180, 150],
    colorFamilyNames: ["Brown"],
    coordinatingColors: { coord1ColorId: "1002", coord2ColorId: "", coord3ColorId: "700001" },
    extra: { lrv: 47, colorGroup: ["Neutrals"], column: "2", row: "1", archived: false },
  }),
  prismRow({
    id: "1002",
    colorNumber: "9912",
    name: "Fixture Harbor",
    brandKey: "HGSW",
    rgb: [40, 70, 100],
    colorFamilyNames: ["Blue"],
    extra: { lrv: 6, colorGroup: ["Neutrals"], column: "2", row: "2", archived: false },
  }),
];

/** /colors/valspar (standalone): no LRV, coordinating colors point at color numbers, not ids. */
export const prismValspar = [
  prismRow({
    id: "1",
    colorNumber: "9001-1A",
    name: "Fixture Meadow",
    brandKey: "",
    rgb: [120, 150, 90],
    coordinatingColors: { coord1ColorId: "9001-2B", coord2ColorId: "9001-3C", coord3ColorId: "0000-0" },
    extra: { colorGroup: ["Invented Group"], column: "1", row: "1", storeStripLocator: "NV999A" },
  }),
  prismRow({ id: "2", colorNumber: "9001-2B", name: "Fixture Cloud", brandKey: "", rgb: [240, 240, 235] }),
  prismRow({ id: "3", colorNumber: "9001-3C", name: "Fixture Plum", brandKey: "", rgb: [90, 40, 80] }),
];

/** /colors/dutchboy: LRV, mdmId, flags, 7-digit ids. */
export const prismDutchBoy = [
  prismRow({
    id: "1999001",
    colorNumber: "901-1DB",
    name: "FIXTURE PEARL",
    brandKey: "",
    rgb: [243, 236, 228],
    coordinatingColors: { coord1ColorId: "1999002", coord2ColorId: "1999003", coord3ColorId: "1999404" },
    extra: { lrv: 83, brandedCollectionNames: ["One Coat"], archived: false, mdmId: "CLR_00000001", flags: ["ONE_COAT"] },
  }),
  prismRow({
    id: "1999002",
    colorNumber: "901-5DB",
    name: "Fixture Moss",
    brandKey: "",
    rgb: [95, 105, 70],
    extra: { lrv: 12, brandedCollectionNames: [], archived: false, mdmId: "CLR_00000002", flags: [] },
  }),
  prismRow({
    id: "1999003",
    colorNumber: "902A",
    name: "Fixture Chalk",
    brandKey: "",
    rgb: [250, 250, 248],
    extra: { lrv: 0, brandedCollectionNames: [], archived: false, mdmId: "CLR_00000003", flags: [] },
  }),
];

/** One row of behr.com/colors/color-detail/query-index.json (every value a string). */
function behrRow(code, name, rgb, o = {}) {
  const hex = rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  return {
    path: `/colors/color-detail/${code.toLowerCase()}`,
    lastModified: 1790000000,
    title: `${name} - ${code} | Invented color family | Fixture`,
    image: "/default-meta-image.png?width=1200&format=pjpg&optimize=medium",
    description: "An invented color for tests.",
    tags: [o.family ?? "Neutral"],
    category: "",
    template: o.premium ? "premium-color-detail" : "color-detail",
    "color-code": code,
    "color-name": name,
    colorDescription: "An invented color for tests.",
    rgbhex: hex,
    "color-family": o.family ?? "Neutral",
    "color-r": String(rgb[0]),
    "color-g": String(rgb[1]),
    "color-b": String(rgb[2]),
    lrv: String(o.lrv ?? 50),
    "premium-color": o.premium ? "true" : "false",
    archived: o.archived ? "true" : "false",
    robots: "",
  };
}

const BEHR_COLUMNS = ["path", "lastModified", "title", "image", "description", "tags", "category", "template", "color-code", "color-name", "colorDescription", "rgbhex", "color-family", "color-r", "color-g", "color-b", "lrv", "premium-color", "archived", "robots"];

export const behrRows = [
  behrRow("ZZ1-01", "Fixture Sand", [220, 200, 170], { family: "Orange", lrv: 60 }),
  behrRow("ZZ1-02", "Fixture Clay", [170, 110, 80], { family: "Orange", lrv: 23 }),
  behrRow("ZZ9-1", "Fixture Ink", [30, 35, 60], { family: "Blue", lrv: 3 }),
  behrRow("999Z-1", "Fixture Retired", [200, 210, 220], { family: "Blue", lrv: 64, archived: true }),
  behrRow("ZZP-1", "Fixture Marquee", [200, 30, 60], { family: "Marquee", lrv: 12, premium: true }),
];

/** The whole index in one sheet, as the live file came (limit = total). */
export function behrSheet(rows = behrRows) {
  return { total: rows.length, offset: 0, limit: rows.length, data: rows, columns: BEHR_COLUMNS, ":type": "sheet" };
}
