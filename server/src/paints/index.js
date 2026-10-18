// SPDX-License-Identifier: MIT
// The paints domain: one row shape, the brands' public lists (opt-in), official-file imports,
// color math and palette suggestions.
export { BRANDS, FAMILY_NAMES, displayName, normalizeRow, dedupeByCode, tidyName } from "./normalize.js";
export { BRAND_FEEDS, FEED_PARSERS, FeedError, loadFeed } from "./feeds.js";
export { BRAND_FILE_PAGES, loadPaletteFiles, paletteLinks } from "./files.js";
export { HEADER_ALIASES, LABEL_PATTERNS, detectFormat, importFile, splitLabel } from "./importers.js";
export { parseAco, parseAse } from "./swatches.js";
export {
  NEAREST_DEFAULTS,
  contrastRatio,
  deltaE2000,
  eligiblePaints,
  estimateLrv,
  hexToLab,
  hexToOklab,
  hexToOklch,
  hexToRgb,
  labToHex,
  lrvDifference,
  lrvOf,
  nearestPaints,
  oklchToHex,
  rgbToHex,
} from "./color.js";
export { HARMONY_DEFAULTS, SCHEME_KINDS, schemeTargets, schemesFromCoordinating, suggestSchemes } from "./harmony.js";
