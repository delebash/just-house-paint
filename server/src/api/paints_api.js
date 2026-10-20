// SPDX-License-Identifier: MIT
// /v1/brands, /v1/paints, /v1/schemes — the paint colors: a brand's public list loaded at the
// user's request (a job; option B), an official palette file imported (option C), search, the
// nearest paints to a color, and color schemes snapped to real paints. The app ships no brand
// data (TASKS, "Design decisions after probe round 1").

import { Hono, input, uploadLimit } from "@delebash/core/platform";
import { ApiError, notFound, RequestValidationError } from "@delebash/core/platform/errors";
import { getState } from "../app_state.js";
import { designsWithBrand } from "../database/houses.js";
import {
  clearBrand,
  getPaint,
  getPaintRow,
  listBrandRows,
  moduleRow,
  moduleRows,
  recordBrandError,
  replaceBrandPaints,
  searchPaints,
} from "../database/paints.js";
import {
  BRAND_FEEDS,
  BRAND_FILE_PAGES,
  BRANDS,
  displayName,
  familyKeys,
  importFile,
  loadFeed,
  loadPaletteFiles,
  nearestPaints,
  schemesFromCoordinating,
  suggestSchemes,
} from "../paints/index.js";
import { BrandParams, HarmonyIn, NearestQuery, PaintParams, PaintSearch } from "../schemas/paints.js";

/** A role of a scheme on the wire: the target color and the real paint it snapped to. */
const wireRole = (role) =>
  role && {
    target: role.target,
    deltaE: role.deltaE,
    paint: role.paint ? { id: role.paint.id, displayName: displayName(role.paint), hex: role.paint.hex, brand: role.paint.brand } : null,
  };
const wireScheme = (s) => ({
  kind: s.kind,
  complete: s.complete,
  notes: s.notes,
  roles: s.roles ? { body: wireRole(s.roles.body), trim: wireRole(s.roles.trim), accent: wireRole(s.roles.accent) } : null,
});

/**
 * `ctx`: { db, jobs, fetch, harmony() → HARMONY_DEFAULTS overrides (settings rows),
 *          maxImportBytes(), colorOrder() → the setting paints.colorOrder }.
 */
/** The app can fetch this brand's colors: a public list, or palette files linked from its page. */
const fetchable = (brand) => BRAND_FEEDS.some((f) => f.brand === brand) || BRAND_FILE_PAGES.some((p) => p.brand === brand);

export function router(ctx = getState()) {
  const app = new Hono();
  const mustBrand = (key) => {
    if (!BRANDS[key]) throw notFound(`no brand ${key}`);
    return key;
  };

  // Every launch brand, whether its colors are here, and how they can be added.
  app.get("/v1/brands", (c) => {
    const rows = Object.fromEntries(listBrandRows(ctx.db).map((b) => [b.key, b]));
    return c.json(
      Object.entries(BRANDS).map(([key, b]) => ({
        key,
        label: b.label,
        // the app can fetch the brand's colors: a public list, or the palette files its page links
        feed: fetchable(key),
        enabled: rows[key]?.enabled ?? false,
        paintCount: rows[key]?.paintCount ?? 0,
        source: rows[key]?.source ?? null,
        loadedAt: rows[key]?.loadedAt ?? null,
        lastError: rows[key]?.lastError ?? null,
      })),
    );
  });

  // Load a brand's colors: its public list, or the palette files its page links to (Benjamin Moore,
  // PPG / Glidden) — at start-up for the brands set to load automatically, or on Load.
  app.post("/v1/brands/:key/load", input({ params: BrandParams }), (c) => {
    const brand = mustBrand(c.req.valid("param").key);
    if (!fetchable(brand)) {
      throw new ApiError(409, "no-public-list", "No public list", `${BRANDS[brand].label} has no color list the app can fetch — import its palette file instead`);
    }
    const job = ctx.jobs.start({ kind: "load-brand", key: brand, label: BRANDS[brand].label, failTitle: `${BRANDS[brand].label}'s colors didn't load` }, async ({ signal, progress }) => {
      progress(0.05, "downloading");
      try {
        const rows = BRAND_FEEDS.some((f) => f.brand === brand)
          ? await loadFeed(brand, { fetch: ctx.fetch, signal })
          : await loadPaletteFiles(brand, { fetch: ctx.fetch, signal, onFile: (done, total) => progress(0.05 + (0.75 * done) / total, "downloading") });
        progress(0.8, "saving");
        // "feed": a public list; "file": the palette files the brand's page links (the page says which)
        const saved = replaceBrandPaints(ctx.db, brand, rows, { source: BRAND_FEEDS.some((f) => f.brand === brand) ? "feed" : "file" });
        // the designs with a color this list no longer has (the screen names them)
        return { brand, paintCount: saved.paintCount, lost: designsWithBrand(ctx.db, brand, { missing: true }) };
      } catch (e) {
        if (!signal.aborted) recordBrandError(ctx.db, brand, e?.message || e, "feed");
        throw e;
      }
    });
    return c.json(job, 202);
  });

  // The designs that use the brand's colors — Remove's confirm names them.
  app.get("/v1/brands/:key/designs", input({ params: BrandParams }), (c) => c.json(designsWithBrand(ctx.db, mustBrand(c.req.valid("param").key))));

  app.delete("/v1/brands/:key", input({ params: BrandParams }), (c) => {
    clearBrand(ctx.db, mustBrand(c.req.valid("param").key));
    return c.body(null, 204);
  });

  // Option C: a palette file the user downloaded from the brand (multipart: file, brand).
  // the file's size, checked as it streams in (a form's own bytes on top)
  app.post("/v1/paints/import", uploadLimit(() => ctx.maxImportBytes() + 64 * 1024, { slug: "file-too-large", title: "File too large" }), async (c) => {
    let body;
    try {
      body = await c.req.parseBody();
    } catch {
      body = {};
    }
    const file = body.file;
    if (!(file instanceof Blob)) throw new RequestValidationError([{ loc: ["body", "file"], msg: "Field required", type: "missing" }]);
    const brand = typeof body.brand === "string" ? body.brand : "";
    if (!BRANDS[brand]) throw new RequestValidationError([{ loc: ["body", "brand"], msg: `Input should be one of ${Object.keys(BRANDS).join(", ")}`, type: "literal_error" }]);
    if (file.size > ctx.maxImportBytes()) throw new ApiError(413, "file-too-large", "File too large", `the file is over ${Math.round(ctx.maxImportBytes() / 1e6)} MB`);
    let result;
    try {
      result = await importFile(Buffer.from(await file.arrayBuffer()), file.name || "palette", { brand });
    } catch (e) {
      throw new ApiError(422, "unreadable-palette", "Unreadable palette file", String(e?.message || e));
    }
    if (!result.rows.length) throw new ApiError(422, "empty-palette", "No colors in the file", result.warnings.join("; ") || "the file holds no colors this app can read");
    const saved = replaceBrandPaints(ctx.db, brand, result.rows, { source: "file" });
    const lost = designsWithBrand(ctx.db, brand, { missing: true });
    return c.json({ brand, format: result.format, paintCount: saved.paintCount, warnings: result.warnings, lost }, 201);
  });

  app.get("/v1/paints", input({ querystring: PaintSearch }), (c) => {
    const q = c.req.valid("query");
    const colorOrder = ctx.colorOrder();
    if (q.colorFamily && !familyKeys(colorOrder).includes(q.colorFamily)) {
      throw new RequestValidationError([
        { loc: ["query", "colorFamily"], msg: `Input should be one of ${familyKeys(colorOrder).join(", ")}`, type: "literal_error" },
      ]);
    }
    return c.json(
      searchPaints(ctx.db, {
        brand: q.brand,
        q: q.q,
        family: q.family,
        colorFamily: q.colorFamily,
        exterior: q.exterior,
        includeArchived: q.archived,
        order: q.order,
        colorOrder,
        limit: q.limit,
        offset: q.offset,
      }),
    );
  });

  app.get("/v1/paints/nearest", input({ querystring: NearestQuery }), (c) => {
    const { hex, brand, k, exterior } = c.req.valid("query");
    const found = nearestPaints(hex, moduleRows(ctx.db, brand || null), { k, brand: brand || undefined, exteriorOnly: exterior });
    return c.json(found.map(({ paint, deltaE }) => ({ paint: { id: paint.id, displayName: displayName(paint), hex: paint.hex, brand: paint.brand }, deltaE })));
  });

  app.get("/v1/paints/:id", input({ params: PaintParams }), (c) => {
    const p = getPaint(ctx.db, c.req.valid("param").id);
    if (!p) throw notFound(`no paint ${c.req.valid("param").id}`);
    return c.json(p);
  });

  // The brand's own pairings for a paint, checked against the scheme rules.
  app.get("/v1/paints/:id/schemes", input({ params: PaintParams }), (c) => {
    const r = getPaintRow(ctx.db, c.req.valid("param").id);
    if (!r) throw notFound(`no paint ${c.req.valid("param").id}`);
    const paints = moduleRows(ctx.db, r.brand);
    const row = paints.find((p) => p.id === r.id) || moduleRow(r);
    return c.json(schemesFromCoordinating(row, paints, { ...ctx.harmony() }).map(wireScheme));
  });

  // Schemes built from a color you like (a hex, or a paint you picked), snapped to the brand.
  app.post("/v1/schemes/harmony", input({ body: HarmonyIn }), (c) => {
    const { base, brand, kinds } = c.req.valid("json");
    mustBrand(brand);
    const paints = moduleRows(ctx.db, brand);
    if (!paints.length) throw new ApiError(409, "no-paints", "No colors for this brand yet", `load or import ${BRANDS[brand].label}'s colors first`);
    let from = base;
    if (!/^#[0-9a-fA-F]{6}$/.test(base)) {
      from = paints.find((p) => p.id === base);
      if (!from) throw new RequestValidationError([{ loc: ["body", "base"], msg: "Neither a #rrggbb color nor a paint of this brand", type: "value_error" }]);
    }
    return c.json(suggestSchemes(from, paints, { ...ctx.harmony(), brand, ...(kinds ? { kinds } : {}) }).map(wireScheme));
  });

  return app;
}
