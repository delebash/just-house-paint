// SPDX-License-Identifier: MIT
// /v1/houses/:id/designs and /v1/designs/:id — a house's saved color choices ({ part: paint }).

import { Hono, input } from "@delebash/core/platform";
import { ApiError, RequestValidationError } from "@delebash/core/platform/errors";
import { designNotFound, houseNotFound } from "./refusals.js";

// a name another design of the house has: the name field's own error (a 422 lands under its field, §15)
const nameTaken = (name) => new RequestValidationError([{ loc: ["body", "name"], msg: `This house already has a design named “${name}”.`, type: "value_error.taken" }]);
import { createDesign, deleteDesign, getDesign, getHouse, listDesigns, updateDesign } from "../database/houses.js";
import { DesignIn, DesignPatch, IdParams } from "../schemas/houses.js";
import { getState } from "../app_state.js";
import { cleanName, nameKey } from "../shared/text.js";

/** `ctx`: { db, maxDesignsPerHouse() } — the limit is a settings row. */
export function router(ctx = getState()) {
  const app = new Hono();
  const mustHouse = (id) => {
    if (!getHouse(ctx.db, id)) throw houseNotFound(id);
  };
  const mustDesign = (id) => {
    const d = getDesign(ctx.db, id);
    if (!d) throw designNotFound(id);
    return d;
  };
  // compared as a person sees them: composed, invisible characters ignored, any case (shared/text.js nameKey)
  const sameName = (houseId, name, except = null) => listDesigns(ctx.db, houseId).some((d) => d.id !== except && nameKey(d.name) === nameKey(name));
  /** The name kept (cleanName); one that shows nothing is refused as the schema refuses an empty one. */
  const kept = (name) => {
    const clean = cleanName(name);
    if (!nameKey(clean)) throw new RequestValidationError([{ loc: ["body", "name"], msg: "Name required", type: "value_error" }]);
    return clean;
  };

  app.get("/v1/houses/:id/designs", input({ params: IdParams }), (c) => {
    mustHouse(c.req.valid("param").id);
    return c.json(listDesigns(ctx.db, c.req.valid("param").id));
  });

  app.post("/v1/houses/:id/designs", input({ params: IdParams, body: DesignIn }), (c) => {
    const houseId = c.req.valid("param").id;
    mustHouse(houseId);
    const { name, colors } = c.req.valid("json");
    const clean = kept(name);
    if (sameName(houseId, clean)) throw nameTaken(clean);
    if (listDesigns(ctx.db, houseId).length >= ctx.maxDesignsPerHouse()) {
      const n = ctx.maxDesignsPerHouse();
      throw new ApiError(409, "too-many-designs", "This house has all the designs it can keep", `a house keeps ${n} designs — delete one first, or raise the number in App Settings → General`);
    }
    return c.json(createDesign(ctx.db, houseId, { name: clean, colors }), 201);
  });

  app.patch("/v1/designs/:id", input({ params: IdParams, body: DesignPatch }), (c) => {
    const current = mustDesign(c.req.valid("param").id);
    const { name, colors } = c.req.valid("json");
    const clean = name === undefined ? undefined : kept(name);
    if (clean !== undefined && sameName(current.houseId, clean, current.id)) throw nameTaken(clean);
    return c.json(updateDesign(ctx.db, current.id, { name: clean, colors }));
  });

  app.delete("/v1/designs/:id", input({ params: IdParams }), (c) => {
    mustDesign(c.req.valid("param").id);
    deleteDesign(ctx.db, c.req.valid("param").id);
    return c.body(null, 204);
  });

  return app;
}
