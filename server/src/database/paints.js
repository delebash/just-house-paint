// SPDX-License-Identifier: MIT
// The only code with SQL for brands and paints (app-structure §16). A brand's paints are replaced
// whole on every load or import (the brand's list is the source of truth); a paint's id is
// `<brand>:<code>`, so a design that names one survives a reload.

import { BRANDS, COLOR_ORDER_DEFAULTS, displayName, familySpan, NEUTRALS } from "../paints/index.js";

/** The current UTC time as stored (ISO-8601). */
const nowIso = () => new Date().toISOString();

export const paintId = (brand, code) => `${brand}:${code}`;

const bool = (v) => (v === null || v === undefined ? null : v ? 1 : 0);
const fromBool = (v) => (v === null || v === undefined ? null : !!v);

/** A row as the paints module shapes it (color math, schemes). */
export function moduleRow(r, coordinating = []) {
  return {
    id: r.id,
    brand: r.brand,
    code: r.code,
    name: r.name,
    hex: r.hex,
    rgb: [r.r, r.g, r.b],
    lab: [r.lab_l, r.lab_a, r.lab_b],
    lrv: r.lrv,
    exterior: fromBool(r.exterior),
    interior: fromBool(r.interior),
    family: r.family,
    collection: r.collection,
    archived: fromBool(r.archived),
    coordinating,
    source: r.source,
    sourceRef: r.source_ref,
  };
}

/** The wire shape the screens read. */
export function wirePaint(r) {
  const row = moduleRow(r);
  return {
    id: row.id,
    brand: row.brand,
    code: row.code,
    name: row.name,
    displayName: displayName(row),
    hex: row.hex,
    lrv: row.lrv,
    exterior: row.exterior,
    family: row.family,
    collection: row.collection,
    archived: row.archived,
  };
}

/** Replace a brand's paints with `rows` (normalized by the paints module). A row without a code is
 *  skipped (its id would be `<brand>:null`); the brand's count is what was stored. */
export function replaceBrandPaints(h, brand, rows, { source }) {
  const now = nowIso();
  h.tx(() => {
    h.run("DELETE FROM paints WHERE brand = ?", [brand]);
    for (const p of rows) {
      if (p.code == null || p.code === "") continue;
      const id = paintId(brand, p.code);
      h.run(
        `INSERT OR REPLACE INTO paints (id, brand, code, name, hex, r, g, b, lab_l, lab_a, lab_b, lrv, exterior, interior, family,
           collection, archived, source, source_ref, loaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          brand,
          String(p.code),
          p.name,
          p.hex,
          p.rgb[0],
          p.rgb[1],
          p.rgb[2],
          p.lab[0],
          p.lab[1],
          p.lab[2],
          p.lrv ?? null,
          bool(p.exterior),
          bool(p.interior),
          p.family ?? null,
          p.collection ?? null,
          bool(p.archived),
          source,
          p.sourceRef ?? null,
          now,
        ],
      );
      for (const other of p.coordinating || []) h.run("INSERT OR IGNORE INTO paint_coordinating (paint_id, other_code) VALUES (?, ?)", [id, String(other)]);
    }
    const label = BRANDS[brand]?.label || brand;
    h.run(
      `INSERT INTO brands (key, label, source, enabled, paint_count, loaded_at, last_error) VALUES (?, ?, ?, 1, ?, ?, NULL)
       ON CONFLICT(key) DO UPDATE SET source = excluded.source, enabled = 1, paint_count = excluded.paint_count,
         loaded_at = excluded.loaded_at, last_error = NULL`,
      [brand, label, source, h.value("SELECT count(*) FROM paints WHERE brand = ?", [brand]), now],
    );
  });
  return getBrand(h, brand);
}

/** A failed load leaves the brand's paints as they were and records why. */
export function recordBrandError(h, brand, message, source) {
  h.run(
    `INSERT INTO brands (key, label, source, enabled, paint_count, last_error) VALUES (?, ?, ?, 0, 0, ?)
     ON CONFLICT(key) DO UPDATE SET last_error = excluded.last_error`,
    [brand, BRANDS[brand]?.label || brand, source, String(message).slice(0, 500)],
  );
}

export function clearBrand(h, brand) {
  h.tx(() => {
    h.run("DELETE FROM paints WHERE brand = ?", [brand]);
    h.run("UPDATE brands SET enabled = 0, paint_count = 0, loaded_at = NULL WHERE key = ?", [brand]);
  });
}

const brandRow = (r) => r && { key: r.key, label: r.label, source: r.source, enabled: !!r.enabled, paintCount: r.paint_count, loadedAt: r.loaded_at, lastError: r.last_error };
export const getBrand = (h, key) => brandRow(h.one("SELECT * FROM brands WHERE key = ?", [key]));
export const listBrandRows = (h) => h.all("SELECT * FROM brands").map(brandRow);

// CIE LCh from the stored CIELAB (SQLite's math functions; paints/order.js is the same math in JS)
const CHROMA = "sqrt(lab_a * lab_a + lab_b * lab_b)";
const HUE = "mod(degrees(atan2(lab_b, lab_a)) + 360, 360)";
// the hue measured from a start angle (a bound parameter), 0–360
const HUE_FROM = `mod(${HUE} - ? + 360, 360)`;

/** Text as search compares it: its accents off ("Cafè" → "cafe", "Crème" → "creme") — the canonical
 *  decomposition (String.prototype.normalize("NFD") —
 *  developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String/normalize) without its
 *  combining marks (\p{M}) — and lower case. */
export const folded = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

// the connections the search's fold() is registered on (better-sqlite3's db.function, deterministic —
// github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#functionname-options-function)
const foldReady = new WeakSet();
function withFold(h) {
  if (!foldReady.has(h.raw)) {
    h.raw.function("fold", { deterministic: true }, (s) => (s === null ? null : folded(s)));
    foldReady.add(h.raw);
  }
  return h;
}

/**
 * Search: `q` matches the name or the code (case- and accent-insensitive: "cafe" finds "Parisian Cafè" —
 * both sides `folded`), `family` (the brand's own),
 * `colorFamily` (paints/order.js: "neutrals" or a hue family of `colorOrder`), `exterior` (true →
 * paints the brand marks for exterior use or doesn't say), archived colors only when asked.
 * `order`: "name", or "color" — the near-grays light to dark, then each hue band light to dark.
 * Returns { total, rows } (wire shape).
 */
export function searchPaints(
  h,
  { brand, q, family, colorFamily, exterior = false, includeArchived = false, order = "name", colorOrder = COLOR_ORDER_DEFAULTS, limit = 200, offset = 0 } = {},
) {
  const where = [];
  const p = [];
  if (brand) {
    where.push("brand = ?");
    p.push(brand);
  }
  if (q) {
    withFold(h);
    where.push("(fold(name) LIKE ? ESCAPE '\\' OR fold(code) LIKE ? ESCAPE '\\')");
    const like = `%${folded(q).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    p.push(like, like);
  }
  if (family) {
    where.push("family = ?");
    p.push(family);
  }
  if (colorFamily === NEUTRALS) {
    where.push(`${CHROMA} < ?`);
    p.push(colorOrder.grayChroma);
  } else if (colorFamily) {
    // an unknown family matches nothing (the route refuses it first)
    const { from, span } = familySpan(colorOrder, colorFamily) || { from: 0, span: 0 };
    where.push(`${CHROMA} >= ? AND ${HUE_FROM} < ?`);
    p.push(colorOrder.grayChroma, from, span);
  }
  if (exterior) where.push("(exterior IS NULL OR exterior = 1)");
  if (!includeArchived) where.push("(archived IS NULL OR archived = 0)");
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = h.value(`SELECT count(*) FROM paints ${w}`, p);
  const byName = "name COLLATE NOCASE, code";
  const [orderBy, op] =
    order === "color"
      ? [
          `${CHROMA} >= ?, CASE WHEN ${CHROMA} < ? THEN 0 ELSE floor(${HUE_FROM} / ?) END, lab_l DESC, ${byName}`,
          [colorOrder.grayChroma, colorOrder.grayChroma, colorOrder.families[0]?.from ?? 0, colorOrder.bandDegrees],
        ]
      : [byName, []];
  const rows = h.all(`SELECT * FROM paints ${w} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...p, ...op, limit, offset]).map(wirePaint);
  return { total, rows };
}

export const getPaintRow = (h, id) => h.one("SELECT * FROM paints WHERE id = ?", [id]);

/** One paint with its coordinating colors (wire shape). */
export function getPaint(h, id) {
  const r = getPaintRow(h, id);
  if (!r) return null;
  const codes = h.all("SELECT other_code FROM paint_coordinating WHERE paint_id = ?", [id]).map((x) => x.other_code);
  const coordinating = codes.map((code) => getPaintRow(h, paintId(r.brand, code))).filter(Boolean).map(wirePaint);
  return { ...wirePaint(r), coordinating };
}

/** Every paint of a brand (or all), as the paints module reads them, coordinating codes included. */
export function moduleRows(h, brand = null) {
  const rows = brand ? h.all("SELECT * FROM paints WHERE brand = ?", [brand]) : h.all("SELECT * FROM paints");
  const coord = new Map();
  for (const c of h.all("SELECT paint_id, other_code FROM paint_coordinating")) {
    if (!coord.has(c.paint_id)) coord.set(c.paint_id, []);
    coord.get(c.paint_id).push(c.other_code);
  }
  return rows.map((r) => moduleRow(r, coord.get(r.id) || []));
}

/** The paints a list of ids names, by id (wire shape) — a design's colors. */
export function paintsById(h, ids) {
  const out = {};
  for (const id of new Set(ids)) {
    const r = getPaintRow(h, id);
    if (r) out[id] = wirePaint(r);
  }
  return out;
}
