// SPDX-License-Identifier: MIT
// One paint row shape for the whole app, whatever the source (a brand's public list or an
// imported palette file), and how a row is named on screen ("SW 7008 Alabaster").
//
// Row: { brand, code, name, hex, rgb: [r,g,b], lab: [L,a,b] (CIE, D65), lrv, exterior, interior,
//        family, collection, coordinating: [codes], archived, source: "feed"|"file", sourceRef }
// `lrv`, `exterior`, `interior`, `family`, `collection` and `archived` are null when the source
// does not say — never guessed. `archived` is beyond the first sketch of the shape: Sherwin-
// Williams and Behr both flag discontinued colors (220 of 2,004 and 2,549 of 5,178 on
// 2026-10-17), and a suggestion should not name a paint that can no longer be bought.
import { converter, formatHex, parse } from "culori";

const toLab65 = converter("lab65");

/**
 * The launch brands (TASKS "Design decisions after probe round 1"). `display` is how a code is
 * written in front of the name; each brand's own writing, checked 2026-10-17:
 * - Sherwin-Williams writes "SW 7008" → prefix "SW " (the approved example "SW 7008 Alabaster").
 * - Behr writes the code alone ("Nairobi Dusk - PPU3-10" in its page titles) → code as-is.
 * - Benjamin Moore writes the code alone ("001 Pink Powderpuff", "OC-17"); "BM" is the prefix
 *   the plan names, so codes like "001" can't be mistaken for another brand's.
 * - Valspar writes the code alone ("8002-45G" on valspar.com) → prefix "Valspar ".
 * - PPG and Glidden share one numbering whose codes already start "PPG" ("PPG1025-1") → no
 *   second prefix (`skipIfCodeStarts`).
 * - HGTV Home by Sherwin-Williams writes "HGSW" + the SW number ("Celery (HGSW6421)" on its
 *   home page); the feed's colorNumber is the bare number → prefix "HGSW", no space.
 * - Dutch Boy codes carry their own "DB" suffix ("311-7DB" on dutchboy.com); "Dutch Boy " is
 *   the prefix the plan names.
 * Every prefix is data, so the app can seed and change it without touching code.
 */
export const BRANDS = Object.freeze({
  "sherwin-williams": { label: "Sherwin-Williams", display: { prefix: "SW", sep: " " } },
  behr: { label: "Behr", display: { prefix: "", sep: "" } },
  "benjamin-moore": { label: "Benjamin Moore", display: { prefix: "BM", sep: " " } },
  valspar: { label: "Valspar", display: { prefix: "Valspar", sep: " " } },
  "ppg-glidden": {
    label: "PPG / Glidden",
    display: { prefix: "PPG", sep: "", skipIfCodeStarts: "PPG" },
  },
  "hgtv-home": { label: "HGTV Home by Sherwin-Williams", display: { prefix: "HGSW", sep: "" } },
  "dutch-boy": { label: "Dutch Boy", display: { prefix: "Dutch Boy", sep: " " } },
});

/**
 * Hue families a row's `family` may take. The feeds mix collection names ("Living Well",
 * "Timeless Color") into their family lists; only these count as the family.
 */
export const FAMILY_NAMES = Object.freeze([
  "Red",
  "Orange",
  "Yellow",
  "Green",
  "Blue",
  "Purple",
  "Pink",
  "Teal",
  "Brown",
  "Gray",
  "Black",
  "White",
  "Neutral",
  "White & Pastel",
]);

/** The on-screen name: "SW 7008 Alabaster", "PPU3-10 Nairobi Dusk", "HGSW6421 Celery". */
export function displayName(row, brands = BRANDS) {
  const name = row.name ?? "";
  if (!row.code) return name;
  const d = brands[row.brand]?.display ?? { prefix: "", sep: "" };
  const code = String(row.code);
  const skip = d.skipIfCodeStarts && code.toUpperCase().startsWith(d.skipIfCodeStarts.toUpperCase());
  const prefixed = d.prefix && !skip ? `${d.prefix}${d.sep ?? ""}${code}` : code;
  return name ? `${prefixed} ${name}` : prefixed;
}

/** "#rrggbb" (lower case) from "#RGB", "RRGGBB", "#rrggbb"; null when it isn't a hex color. */
export function normalizeHex(value) {
  if (typeof value !== "string") return null;
  const s = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(s)) return `#${s.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(s)) return `#${[...s.toLowerCase()].map((c) => c + c).join("")}`;
  return null;
}

/** [r,g,b] 0..255 integers → "#rrggbb"; null when any channel is missing or out of range. */
export function rgbToHex(rgb) {
  if (!Array.isArray(rgb) || rgb.length !== 3) return null;
  const n = rgb.map(Number);
  if (n.some((v) => !Number.isFinite(v) || v < 0 || v > 255)) return null;
  return `#${n.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** "#rrggbb" → [r,g,b] 0..255 integers. */
export function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  return [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
}

/** CIE L*a*b* (D65) of a hex color, as [L, a, b]. */
export function hexToLab(hex) {
  const c = toLab65(parse(normalizeHex(hex)));
  return [c.l, c.a ?? 0, c.b ?? 0];
}

/** Names written all in capitals ("PALE ECRU", PPG's files) → "Pale Ecru"; others unchanged. */
export function tidyName(name) {
  const s = String(name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[A-Z]/.test(s) || /[a-z]/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s\-/(&])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

/** The first hue family in a list, or null. */
export function pickFamily(names, families = FAMILY_NAMES) {
  const list = Array.isArray(names) ? names : names == null ? [] : [names];
  return list.find((n) => families.includes(n)) ?? null;
}

const boolOrNull = (v) => (typeof v === "boolean" ? v : null);
const numOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Builds a full row from what a source gives. The color comes from `hex`, else `rgb`; `rgb` and
 * `lab` are always derived from the final hex so every row agrees with itself (the feeds' own
 * L*a*b* is this same D65 conversion of their hex — matched within 0.01 on 2026-10-17).
 * An LRV of 0 or below is treated as missing: no paint reflects no light at all.
 * Throws when there is no usable color or no name and no code.
 */
export function normalizeRow(input, { brand, source, sourceRef = null }) {
  const hex = normalizeHex(input.hex) ?? rgbToHex(input.rgb);
  if (!hex) throw new Error(`paint row has no usable color: ${JSON.stringify(input).slice(0, 120)}`);
  const code = input.code == null || input.code === "" ? null : String(input.code).trim();
  const name = tidyName(input.name);
  if (!code && !name) throw new Error("paint row has neither a code nor a name");
  const lrv = numOrNull(input.lrv);
  return {
    brand,
    code,
    name,
    hex: formatHex(parse(hex)),
    rgb: hexToRgb(hex),
    lab: hexToLab(hex),
    lrv: lrv !== null && lrv > 0 && lrv <= 100 ? lrv : null,
    exterior: boolOrNull(input.exterior),
    interior: boolOrNull(input.interior),
    family: input.family ?? null,
    collection: input.collection ?? null,
    coordinating: Array.isArray(input.coordinating) ? input.coordinating.map(String) : [],
    archived: boolOrNull(input.archived),
    source,
    sourceRef,
  };
}

/** Drops repeated codes (keeps the first); rows without a code are kept as they are. */
export function dedupeByCode(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    if (!r.code) return true;
    const k = `${r.brand}\u0000${r.code.toUpperCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
