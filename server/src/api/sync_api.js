// SPDX-License-Identifier: MIT
// GET /v1/sync/rev — the kit's watchSync contract (its common/services/syncWatch.js): `rev` moves when another
// window changed something on this server (changes.js counts each window's changes apart — its X-Client-Id), and
// the page reads again; `epoch` is new after a restore or a reset (everything changed); `pollSeconds` is how
// often a window asks (Settings → General, a row).

import { Hono } from "@delebash/core/platform";
import { getState } from "../app_state.js";

/** `ctx`: { changes (changes.js ChangeCounter), checkSeconds() } */
export function router(ctx = getState()) {
  const app = new Hono();
  // `rev` is opaque — this process's boot id and the count: a server started again (its count from 0) is a change
  // to the window even where the counts happen to match; `epoch` moves only when the data was replaced
  app.get("/v1/sync/rev", (c) => {
    const n = ctx.changes.revFor(c.req.header("x-client-id") || null);
    return c.json({ rev: `${ctx.changes.boot}:${n}`, epoch: ctx.changes.epoch, pollSeconds: ctx.checkSeconds?.() ?? 5 });
  });
  return app;
}
