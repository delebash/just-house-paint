// SPDX-License-Identifier: MIT
// Option C (the fallback): the user imports a brand's official free palette file.
//   .ase  Adobe Swatch Exchange — Benjamin Moore's per-collection files, PPG/Glidden's palette
//   .aco  Photoshop swatches    — PPG/Glidden's palette, Sherwin-Williams' downloads
//   .xlsx Excel                 — PPG/Glidden's "RGB and LRV Values" (R, G, B, LRV; no hex)
//   .csv  any table with a header row (header names mapped below, or by `mapping`)
// Swatch files carry one label per color ("001 Pink Powderpuff", "PPG0993-1 PEREGRINE");
// `splitLabel` separates the code from the name.
import { parse as parseCsv } from "csv-parse/sync";
import readExcelFile from "read-excel-file/node";
import { dedupeByCode, normalizeHex, normalizeRow } from "./normalize.js";
import { isAco, isAse, parseAco, parseAse } from "./swatches.js";

/**
 * Table headers each field answers to, compared after lower-casing and dropping everything but
 * letters and digits ("Color Number" → "colornumber"). `rgb` is one "r,g,b" column.
 */
export const HEADER_ALIASES = Object.freeze({
  code: ["code", "colorcode", "colourcode", "colornumber", "colournumber", "number", "colorno", "colorid"],
  name: ["name", "colorname", "colourname"],
  hex: ["hex", "hexcode", "hexvalue", "rgbhex", "colorhex", "html", "htmlcolor"],
  rgb: ["rgb", "rgbvalue", "rgbvalues"],
  r: ["r", "red"],
  g: ["g", "green"],
  b: ["b", "blue"],
  lrv: ["lrv", "lightreflectancevalue"],
  exterior: ["exterior", "isexterior"],
  interior: ["interior", "isinterior"],
  family: ["family", "colorfamily", "colourfamily", "hue", "huefamily"],
  collection: ["collection", "collectionname", "palette"],
});

/**
 * Per-brand label patterns for swatch files, tried before the generic split. Each has named
 * groups `code` and `name`. Sherwin-Williams writes "SW 7008 Alabaster".
 */
export const LABEL_PATTERNS = Object.freeze({
  "sherwin-williams": "^SW\\s*(?<code>\\d{4})\\s+(?<name>.+)$",
  "hgtv-home": "^HGSW\\s*(?<code>\\d{4})\\s+(?<name>.+)$",
});

const headerKey = (h) =>
  String(h ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** A swatch label → { code, name }. A code is a word with a digit in it, first or last. */
export function splitLabel(label, { brand, patterns = LABEL_PATTERNS } = {}) {
  const s = String(label ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const own = brand && patterns[brand] ? new RegExp(patterns[brand], "i").exec(s) : null;
  if (own?.groups) return { code: own.groups.code, name: own.groups.name.trim() };
  const words = s.split(" ");
  if (words.length > 1 && /\d/.test(words[0])) return { code: words[0], name: words.slice(1).join(" ") };
  if (words.length > 1 && /\d/.test(words.at(-1))) return { code: words.at(-1), name: words.slice(0, -1).join(" ") };
  if (words.length === 1 && /\d/.test(s) && !/\s/.test(s)) return { code: s, name: "" };
  return { code: null, name: s };
}

function parseBool(v) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (["true", "yes", "y", "1", "x"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return null;
}

/** Column index per field, from a header row; `mapping` names headers for fields explicitly. */
export function mapHeader(header, { mapping = {}, aliases = HEADER_ALIASES } = {}) {
  const keys = header.map(headerKey);
  const cols = {};
  for (const [field, names] of Object.entries(aliases)) {
    const wanted = mapping[field] != null ? [headerKey(mapping[field])] : names;
    const i = keys.findIndex((k) => k && wanted.includes(k));
    if (i >= 0) cols[field] = i;
  }
  return cols;
}

const hasColor = (cols) => cols.hex !== undefined || cols.rgb !== undefined || (cols.r !== undefined && cols.g !== undefined && cols.b !== undefined);
const hasLabel = (cols) => cols.code !== undefined || cols.name !== undefined;

/** Rows of cells (the first rows may be titles) → normalized paint rows. */
export function rowsFromTable(table, { brand, filename, mapping, aliases, headerSearchRows = 20 }) {
  const warnings = [];
  let headerAt = -1;
  let cols = {};
  for (let i = 0; i < Math.min(table.length, headerSearchRows); i++) {
    const c = mapHeader(table[i] ?? [], { mapping, aliases });
    if (hasColor(c) && hasLabel(c)) {
      headerAt = i;
      cols = c;
      break;
    }
  }
  if (headerAt < 0) {
    throw new Error(`${filename}: no header row with a code or name column and a hex or R,G,B column`);
  }
  const cell = (row, field) => (cols[field] === undefined ? null : (row[cols[field]] ?? null));
  const rows = [];
  for (let i = headerAt + 1; i < table.length; i++) {
    const row = table[i] ?? [];
    if (row.every((v) => v === null || v === "")) continue;
    let rgb = null;
    if (cols.r !== undefined) rgb = [cell(row, "r"), cell(row, "g"), cell(row, "b")].map((v) => (v === null || v === "" ? Number.NaN : Number(v)));
    else if (cols.rgb !== undefined) rgb = String(cell(row, "rgb") ?? "").split(/[\s,;/]+/).filter(Boolean).map(Number);
    try {
      rows.push(
        normalizeRow(
          {
            code: cell(row, "code"),
            name: cell(row, "name"),
            hex: normalizeHex(String(cell(row, "hex") ?? "")),
            rgb,
            lrv: cell(row, "lrv"),
            exterior: parseBool(cell(row, "exterior")),
            interior: parseBool(cell(row, "interior")),
            family: cell(row, "family") || null,
            collection: cell(row, "collection") || null,
            coordinating: [],
            archived: null,
          },
          { brand, source: "file", sourceRef: `${filename}#row${i + 1}` },
        ),
      );
    } catch (err) {
      warnings.push(`row ${i + 1}: ${err.message}`);
    }
  }
  return { rows, warnings };
}

function rowsFromSwatches({ swatches, warnings }, { brand, filename, patterns }) {
  const rows = [];
  for (const [i, s] of swatches.entries()) {
    const { code, name } = splitLabel(s.name, { brand, patterns });
    try {
      rows.push(
        normalizeRow(
          { code, name, hex: s.hex, collection: s.group, coordinating: [] },
          { brand, source: "file", sourceRef: `${filename}#${i + 1}` },
        ),
      );
    } catch (err) {
      warnings.push(`swatch ${i + 1}: ${err.message}`);
    }
  }
  return { rows, warnings };
}

const toBuffer = (b) =>
  Buffer.isBuffer(b) ? b : b instanceof ArrayBuffer ? Buffer.from(b) : Buffer.from(b.buffer, b.byteOffset, b.byteLength);

/** An Excel workbook: the first sheet that has a usable header row. */
async function rowsFromWorkbook(buffer, opts) {
  const sheets = await readExcelFile(toBuffer(buffer));
  let lastError;
  for (const { sheet, data } of sheets) {
    try {
      return rowsFromTable(data, { ...opts, filename: `${opts.filename} [${sheet}]` });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error(`${opts.filename}: the workbook has no sheets`);
}

/** The file's format, from its extension, else from its first bytes. */
export function detectFormat(buffer, filename = "") {
  const ext = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase();
  if (["ase", "aco", "xlsx", "csv"].includes(ext)) return ext;
  if (isAse(buffer)) return "ase";
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (u8[0] === 0x50 && u8[1] === 0x4b) return "xlsx"; // a ZIP container
  if (isAco(buffer)) return "aco";
  return null;
}

/**
 * Reads an official palette file into paint rows.
 * @param {Buffer|Uint8Array|ArrayBuffer} buffer
 * @param {string} filename  used for the format and in each row's `sourceRef`
 * @param {{ brand: string, mapping?: Record<string,string>, patterns?: Record<string,string> }} options
 * @returns {Promise<{ format: string, rows: object[], warnings: string[] }>}
 */
export async function importFile(buffer, filename, { brand, mapping, patterns = LABEL_PATTERNS, aliases } = {}) {
  if (!brand) throw new TypeError("importFile needs the brand the file belongs to");
  const format = detectFormat(buffer, filename);
  const opts = { brand, filename, mapping, patterns, aliases };
  let out;
  if (format === "ase") out = rowsFromSwatches(parseAse(buffer), opts);
  else if (format === "aco") out = rowsFromSwatches(parseAco(buffer), opts);
  else if (format === "xlsx") out = await rowsFromWorkbook(buffer, opts);
  else if (format === "csv") {
    const text = toBuffer(buffer).toString("utf8");
    const table = parseCsv(text, { bom: true, relax_column_count: true, skip_empty_lines: true, trim: true });
    out = rowsFromTable(table, opts);
  } else {
    throw new Error(`${filename}: not a format this app reads (.ase, .aco, .xlsx, .csv)`);
  }
  const rows = dedupeByCode(out.rows);
  if (rows.length < out.rows.length) out.warnings.push(`${out.rows.length - rows.length} repeated codes dropped`);
  return { format, rows, warnings: out.warnings };
}
