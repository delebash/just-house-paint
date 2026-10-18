// SPDX-License-Identifier: MIT
// /v1/houses/:id/designs and /v1/designs/:id — a house's saved color choices ({ part: paint }).

import { Hono, input } from "@delebash/core/platform";
import { conflict, notFound } from "@delebash/core/platform/errors";
import { createDesign, deleteDesign, getDesign, getHouse, listDesigns, updateDesign } from "../database/houses.js";
import { DesignIn, DesignPatch, IdParams } from "../schemas/houses.js";
import { getState } from "../app_state.js";

/** `ctx`: { db, maxDesignsPerHouse() } — the limit is a settings row. */
export function router(ctx = getState()) {
  const app = new Hono();
  const mustHouse = (id) => {
    if (!getHouse(ctx.db, id)) throw notFound(`no house ${id}`);
  };
  const mustDesign = (id) => {
    const d = getDesign(ctx.db, id);
    if (!d) throw notFound(`no design ${id}`);
    return d;
  };
  const sameName = (houseId, name, except = null) =>
    listDesigns(ctx.db, houseId).some((d) => d.id !== except && d.name.toLocaleLowerCase() === name.toLocaleLowerCase());

  app.get("/v1/houses/:id/designs", input({ params: IdParams }), (c) => {
    mustHouse(c.req.valid("param").id);
    return c.json(listDesigns(ctx.db, c.req.valid("param").id));
  });

  app.post("/v1/houses/:id/designs", input({ params: IdParams, body: DesignIn }), (c) => {
    const houseId = c.req.valid("param").id;
    mustHouse(houseId);
    const { name, colors } = c.req.valid("json");
    const clean = name.trim();
    if (sameName(houseId, clean)) throw conflict(`this house already has a design named "${clean}"`);
    if (listDesigns(ctx.db, houseId).length >= ctx.maxDesignsPerHouse()) {
      throw conflict(`a house keeps at most ${ctx.maxDesignsPerHouse()} designs — delete one first`);
    }
    return c.json(createDesign(ctx.db, houseId, { name: clean, colors }), 201);
  });

  app.patch("/v1/designs/:id", input({ params: IdParams, body: DesignPatch }), (c) => {
    const current = mustDesign(c.req.valid("param").id);
    const { name, colors } = c.req.valid("json");
    const clean = name?.trim();
    if (clean !== undefined && sameName(current.houseId, clean, current.id)) throw conflict(`this house already has a design named "${clean}"`);
    return c.json(updateDesign(ctx.db, current.id, { name: clean, colors }));
  });

  app.delete("/v1/designs/:id", input({ params: IdParams }), (c) => {
    mustDesign(c.req.valid("param").id);
    deleteDesign(ctx.db, c.req.valid("param").id);
    return c.body(null, 204);
  });

  return app;
}
