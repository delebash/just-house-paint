// SPDX-License-Identifier: MIT
// The only code with SQL for houses, parts, designs and renders (app-structure §16). Every
// function takes the kit's database handle (`openDatabase`) first and returns the wire shape
// (camelCase). A design's colors are rows of design_colors — { partKey: paintId }.

import { randomUUID } from "node:crypto";

/** The current UTC time as stored (ISO-8601). */
const nowIso = () => new Date().toISOString();

/** { partKey: paintId } — the paint each part has now, where its owner said. */
const currentPaintsOf = (h, houseId) =>
  Object.fromEntries(h.all("SELECT key, paint_id FROM current_paints WHERE house_id = ? ORDER BY key", [houseId]).map((r) => [r.key, r.paint_id]));

const house = (r) =>
  r && {
    id: r.id,
    name: r.name,
    originalFile: r.original_file,
    width: r.width,
    height: r.height,
    displayWidth: r.display_width,
    displayHeight: r.display_height,
    partsFoundAt: r.parts_found_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };

const part = (r) =>
  r && {
    key: r.key,
    paintable: !!r.paintable,
    area: r.area,
    score: r.score,
    source: r.source,
    position: r.position,
    updatedAt: r.updated_at,
  };

// ── houses ────────────────────────────────────────────────────────────────

export function createHouse(h, { id = randomUUID(), name, originalFile, width, height, displayWidth, displayHeight }) {
  const now = nowIso();
  h.run(
    `INSERT INTO houses (id, name, original_file, width, height, display_width, display_height, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, originalFile, width, height, displayWidth, displayHeight, now, now],
  );
  return getHouse(h, id);
}

export function listHouses(h) {
  return h
    .all(
      `SELECT h.*, (SELECT count(*) FROM designs d WHERE d.house_id = h.id) AS design_count
       FROM houses h ORDER BY h.updated_at DESC`,
    )
    .map((r) => ({ ...house(r), designCount: r.design_count }));
}

export function getHouse(h, id) {
  const one = house(h.one("SELECT * FROM houses WHERE id = ?", [id]));
  return one && { ...one, currentPaints: currentPaintsOf(h, id) };
}

/** Set the paint each part has now: `paints` ({ part: paintId }) replaces the house's whole map. */
export function setCurrentPaints(h, id, paints) {
  h.tx(() => {
    h.run("DELETE FROM current_paints WHERE house_id = ?", [id]);
    for (const [key, paintId] of Object.entries(paints)) {
      h.run("INSERT INTO current_paints (house_id, key, paint_id) VALUES (?, ?, ?)", [id, key, paintId]);
    }
    h.run("UPDATE houses SET updated_at = ? WHERE id = ?", [nowIso(), id]);
  });
  return getHouse(h, id);
}

export function renameHouse(h, id, name) {
  const r = h.run("UPDATE houses SET name = ?, updated_at = ? WHERE id = ?", [name, nowIso(), id]);
  return r.changes ? getHouse(h, id) : null;
}

export const deleteHouse = (h, id) => h.run("DELETE FROM houses WHERE id = ?", [id]).changes > 0;

export const touchHouse = (h, id) => h.run("UPDATE houses SET updated_at = ? WHERE id = ?", [nowIso(), id]);

// ── parts ─────────────────────────────────────────────────────────────────

/** Replace every part of a house (a new find-parts run); `parts` in display order. */
export function replaceParts(h, houseId, parts) {
  const now = nowIso();
  h.tx(() => {
    h.run("DELETE FROM parts WHERE house_id = ?", [houseId]);
    parts.forEach((p, i) => {
      h.run(
        "INSERT INTO parts (house_id, key, paintable, area, score, source, position, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [houseId, p.key, p.paintable ? 1 : 0, p.area, p.score ?? null, p.source || "auto", i, now],
      );
    });
    h.run("UPDATE houses SET parts_found_at = ?, updated_at = ? WHERE id = ?", [now, now, houseId]);
  });
  return listParts(h, houseId);
}

export const listParts = (h, houseId) => h.all("SELECT * FROM parts WHERE house_id = ? ORDER BY position", [houseId]).map(part);

export const getPart = (h, houseId, key) => part(h.one("SELECT * FROM parts WHERE house_id = ? AND key = ?", [houseId, key]));

/** A part's mask changed by hand (its area, and `source`: edited, or added for a new part). */
export function updatePartMask(h, houseId, key, { area, paintable, source = "edited" }) {
  const now = nowIso();
  const existing = getPart(h, houseId, key);
  if (existing) {
    h.run("UPDATE parts SET area = ?, source = ?, updated_at = ? WHERE house_id = ? AND key = ?", [area, existing.source === "added" ? "added" : source, now, houseId, key]);
  } else {
    const position = h.value("SELECT coalesce(max(position), -1) + 1 FROM parts WHERE house_id = ?", [houseId]);
    h.run(
      "INSERT INTO parts (house_id, key, paintable, area, score, source, position, updated_at) VALUES (?, ?, ?, ?, NULL, 'added', ?, ?)",
      [houseId, key, paintable === false ? 0 : 1, area, position, now],
    );
  }
  return getPart(h, houseId, key);
}

// ── designs ───────────────────────────────────────────────────────────────

function colorsOf(h, designId) {
  return Object.fromEntries(h.all("SELECT part_key, paint_id FROM design_colors WHERE design_id = ?", [designId]).map((r) => [r.part_key, r.paint_id]));
}

const design = (h, r) => r && { id: r.id, houseId: r.house_id, name: r.name, colors: colorsOf(h, r.id), createdAt: r.created_at, updatedAt: r.updated_at };

function writeColors(h, designId, colors) {
  h.run("DELETE FROM design_colors WHERE design_id = ?", [designId]);
  for (const [partKey, paintId] of Object.entries(colors || {})) {
    if (paintId) h.run("INSERT INTO design_colors (design_id, part_key, paint_id) VALUES (?, ?, ?)", [designId, partKey, paintId]);
  }
}

/**
 * The designs whose colors name a paint of `brand` — with `missing`, only paints no longer stored (the
 * brand loaded again without them, or removed; the id stays, so the color comes back with the paint).
 * [{ houseId, house, designId, design, parts: [part keys] }], by house and design name.
 */
export function designsWithBrand(h, brand, { missing = false } = {}) {
  const rows = h.all(
    `SELECT d.id AS design_id, d.name AS design_name, hs.id AS house_id, hs.name AS house_name, dc.part_key
       FROM design_colors dc
       JOIN designs d ON d.id = dc.design_id
       JOIN houses hs ON hs.id = d.house_id
       LEFT JOIN paints p ON p.id = dc.paint_id
      WHERE substr(dc.paint_id, 1, ?) = ?${missing ? " AND p.id IS NULL" : ""}
      ORDER BY hs.name, d.name, dc.part_key`,
    [brand.length + 1, `${brand}:`],
  );
  const byDesign = new Map();
  for (const r of rows) {
    if (!byDesign.has(r.design_id)) byDesign.set(r.design_id, { houseId: r.house_id, house: r.house_name, designId: r.design_id, design: r.design_name, parts: [] });
    byDesign.get(r.design_id).parts.push(r.part_key);
  }
  return [...byDesign.values()];
}

export const listDesigns = (h, houseId) => h.all("SELECT * FROM designs WHERE house_id = ? ORDER BY created_at", [houseId]).map((r) => design(h, r));

export const getDesign = (h, id) => design(h, h.one("SELECT * FROM designs WHERE id = ?", [id]));

export function createDesign(h, houseId, { name, colors = {} }) {
  const id = randomUUID();
  const now = nowIso();
  h.tx(() => {
    h.run("INSERT INTO designs (id, house_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", [id, houseId, name, now, now]);
    writeColors(h, id, colors);
    h.run("UPDATE houses SET updated_at = ? WHERE id = ?", [now, houseId]);
  });
  return getDesign(h, id);
}

export function updateDesign(h, id, { name, colors }) {
  const current = getDesign(h, id);
  if (!current) return null;
  const now = nowIso();
  h.tx(() => {
    if (name !== undefined) h.run("UPDATE designs SET name = ? WHERE id = ?", [name, id]);
    if (colors !== undefined) writeColors(h, id, colors);
    h.run("UPDATE designs SET updated_at = ? WHERE id = ?", [now, id]);
    h.run("UPDATE houses SET updated_at = ? WHERE id = ?", [now, current.houseId]);
  });
  return getDesign(h, id);
}

export const deleteDesign = (h, id) => h.run("DELETE FROM designs WHERE id = ?", [id]).changes > 0;

// ── renders (AI photos) ───────────────────────────────────────────────────

export function addRender(h, { houseId, designId = null, file, engine, deltaE = null, seconds = null }) {
  const id = randomUUID();
  h.run("INSERT INTO renders (id, house_id, design_id, file, engine, delta_e, seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
    id,
    houseId,
    designId,
    file,
    engine,
    deltaE,
    seconds,
    nowIso(),
  ]);
  return getRender(h, id);
}

const render = (r) =>
  r && { id: r.id, houseId: r.house_id, designId: r.design_id, file: r.file, engine: r.engine, deltaE: r.delta_e, seconds: r.seconds, createdAt: r.created_at };

export const getRender = (h, id) => render(h.one("SELECT * FROM renders WHERE id = ?", [id]));
export const listRenders = (h, houseId) => h.all("SELECT * FROM renders WHERE house_id = ? ORDER BY created_at DESC", [houseId]).map(render);
export const deleteRender = (h, id) => h.run("DELETE FROM renders WHERE id = ?", [id]).changes > 0;
