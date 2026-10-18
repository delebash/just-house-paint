// SPDX-License-Identifier: MIT
// The app's own tables, as numbered migrations (app-structure §16). The kit's `migrate` keeps the
// version in SQLite's own counter (PRAGMA user_version) and runs each newer migration once, in one
// transaction with the counter. Newest last; an applied migration is never edited — a schema
// change is a new entry.
//
// Ids are random text (crypto.randomUUID — a table that may sync never uses AUTOINCREMENT), times
// are ISO-8601 UTC text, columns are typed (snake_case here; the stores map them to the camelCase
// wire). A house's files live under <dataDir>/houses/<id>/ (files.js); the tables hold their names
// and the facts the screens list. The shared LLM stack's tables ride the same database: installLlm
// creates them.

export const MIGRATIONS = [
  {
    version: 1,
    name: "settings",
    up: `
      -- The app's settings (one row per key, the value JSON), the renderer's preferences
      -- ("pref.<key>" rows, behind /v1/prefs) and the server's access tokens (the "auth" row).
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: "houses, parts, designs, paints, renders",
    up: `
      CREATE TABLE houses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        original_file TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        display_width INTEGER NOT NULL,
        display_height INTEGER NOT NULL,
        parts_found_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE parts (
        house_id TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        paintable INTEGER NOT NULL,
        area INTEGER NOT NULL,
        score REAL,
        source TEXT NOT NULL CHECK (source IN ('auto', 'edited', 'added')),
        position INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (house_id, key)
      );

      CREATE TABLE designs (
        id TEXT PRIMARY KEY,
        house_id TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX designs_by_house ON designs(house_id);

      CREATE TABLE design_colors (
        design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
        part_key TEXT NOT NULL,
        paint_id TEXT NOT NULL,
        PRIMARY KEY (design_id, part_key)
      );

      CREATE TABLE brands (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('feed', 'file')),
        enabled INTEGER NOT NULL DEFAULT 0,
        paint_count INTEGER NOT NULL DEFAULT 0,
        loaded_at TEXT,
        last_error TEXT
      );

      CREATE TABLE paints (
        id TEXT PRIMARY KEY,
        brand TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        hex TEXT NOT NULL,
        r INTEGER NOT NULL,
        g INTEGER NOT NULL,
        b INTEGER NOT NULL,
        lab_l REAL NOT NULL,
        lab_a REAL NOT NULL,
        lab_b REAL NOT NULL,
        lrv REAL,
        exterior INTEGER,
        interior INTEGER,
        family TEXT,
        collection TEXT,
        archived INTEGER,
        source TEXT NOT NULL,
        source_ref TEXT,
        loaded_at TEXT NOT NULL
      );
      CREATE INDEX paints_by_brand ON paints(brand);
      CREATE INDEX paints_by_name ON paints(name COLLATE NOCASE);

      CREATE TABLE paint_coordinating (
        paint_id TEXT NOT NULL REFERENCES paints(id) ON DELETE CASCADE,
        other_code TEXT NOT NULL,
        PRIMARY KEY (paint_id, other_code)
      );

      CREATE TABLE renders (
        id TEXT PRIMARY KEY,
        house_id TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
        design_id TEXT REFERENCES designs(id) ON DELETE SET NULL,
        file TEXT NOT NULL,
        engine TEXT NOT NULL,
        delta_e REAL,
        seconds REAL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX renders_by_house ON renders(house_id);
    `,
  },
  {
    version: 3,
    name: "the paint on each part now",
    up: `
      -- The paint a part has today, when its owner knows it: the light on the photo is worked out
      -- from it (src/services/tint.js). Kept per house, not per part row, so finding the parts
      -- again keeps it.
      CREATE TABLE current_paints (
        house_id TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        paint_id TEXT NOT NULL,
        PRIMARY KEY (house_id, key)
      );
    `,
  },
];

/**
 * The tables a migration's SQL creates, as the kit's backup router reads them ({ name, ddl }): the
 * DDL names each table's parents (REFERENCES), so a restore and a reset take them in order.
 */
export function tableDefs(sql) {
  const out = [];
  for (const m of sql.matchAll(/CREATE TABLE\s+"?(\w+)"?\s*\(([\s\S]*?)\n\s*\);/gi)) out.push({ name: m[1], ddl: m[0] });
  return out;
}

/** The app's tables, for the kit's backup/restore/reset (makeDataRouter's `metadata`). */
export const APP_TABLES = MIGRATIONS.flatMap((m) => tableDefs(m.up));
