// SPDX-License-Identifier: MIT
// Other windows' changes. One server, several windows — the desktop app, a browser on the server started on its
// own, a phone — and an open page read its house once: a window saved over what another had changed, unseen (the
// eleventh review, 2026-10-20). Each window sends its id (X-Client-Id — the kit's transport, installLlmUi
// `sendClientId`); every write that succeeds is a change by that window, and GET /v1/sync/rev answers each window
// the count of changes the OTHERS made — the kit's watchSync contract (its counter moves, the page reads again).
// A restore or a reset is everyone's change and starts a new series (`epoch`). Kept in memory: a new series at
// each start, which every window reads as a change.

import { randomUUID } from "node:crypto";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
// a window not heard from in a day is forgotten (each load of a page is a new window)
const FORGET_MS = 24 * 3600_000;

export class ChangeCounter {
  #total = 0;
  #mine = new Map(); // window id → { n: its changes, seen: when it last asked or wrote }
  epoch = randomUUID();

  #window(id) {
    let w = this.#mine.get(id);
    if (!w) {
      if (this.#mine.size > 200) {
        const old = Date.now() - FORGET_MS;
        for (const [k, v] of this.#mine) if (v.seen < old) this.#mine.delete(k);
      }
      w = { n: 0, seen: 0 };
      this.#mine.set(id, w);
    }
    w.seen = Date.now();
    return w;
  }

  /** A change made by window `clientId` — none: by no window (a job's end with no window behind it). */
  note(clientId = null) {
    this.#total += 1;
    if (clientId) this.#window(clientId).n += 1;
  }

  /** Everything changed (a restore, a reset): every window reads again. */
  replaced() {
    this.#total += 1;
    this.epoch = randomUUID();
  }

  /** The count of changes window `clientId` didn't make. */
  revFor(clientId = null) {
    return this.#total - (clientId ? this.#window(clientId).n : 0);
  }

  /** Hono middleware: a write that succeeded is its window's change (`except`: paths that aren't one). */
  middleware({ except = [] } = {}) {
    const skip = new Set(except);
    return async (c, next) => {
      await next();
      if (SAFE.has(c.req.method) || skip.has(c.req.path) || c.res.status >= 400) return;
      this.note(c.req.header("x-client-id") || null);
    };
  }
}
