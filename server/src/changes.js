// SPDX-License-Identifier: MIT
// Other windows' changes. One server, several windows — the desktop app, a browser on the server started on its
// own, a phone — and an open page read its house once: a window saved over what another had changed, unseen (the
// eleventh review, 2026-10-20). Each window sends its id (X-Client-Id — the kit's transport, installLlmUi
// `sendClientId`); every write to the app's data that succeeds is a change by that window, and GET /v1/sync/rev
// answers each window the count of changes the OTHERS made — the kit's watchSync contract (the counter moves, the
// page reads again).
//
// Two signals (the twelfth review): `boot`, this process's — a server started again counts from 0, so the answer's
// `rev` carries it and a restart is a change (the page reads again in place, its colors on screen kept); and
// `epoch`, kept in the database and renewed only by a restore or a reset that succeeded — the data was replaced,
// the window reloads.

import { randomUUID } from "node:crypto";
import { getSetting, setSetting } from "./database/settings.js";

// the writes that change what another window shows: the houses, their parts, designs, paints now and AI photos; the
// brands and their colors; the app's settings; the engines (the house page offers or uses them). Not one: a window's
// own prefs, a scheme worked out, a log line, a cancel (the job's end is counted), an AI run, the tokens.
export const DATA_WRITES = /^\/v1\/(houses|designs|renders|brands|paints|settings|segment\/install|aiphoto\/install)(\/|$)/;

/** The data's epoch renewed, on `h` — inside a restore's transaction (its afterCopy), right after a reset's seed. */
export const renewEpoch = (h) => setSetting(h, EPOCH_KEY, randomUUID());
// a window not heard from in a day is forgotten (each load of a page is a new window), looked over at most hourly
const FORGET_MS = 24 * 3600_000;
const EPOCH_KEY = "dataEpoch";

export class ChangeCounter {
  #total = 0;
  #mine = new Map(); // window id → { n: its changes, seen: when it last asked or wrote }
  #swept = Date.now();
  #db;
  boot = randomUUID();

  /** `db`: where the data's epoch is kept (a settings row, not one Settings shows). */
  constructor({ db = null } = {}) {
    if (db) this.useDatabase(db);
  }

  /** The database the data's epoch is kept in (the app opens it after the counter's middleware is in place): one
   *  made there now if it has none — a poll only ever reads it. */
  useDatabase(db) {
    this.#db = db;
    if (typeof getSetting(db, EPOCH_KEY) !== "string") renewEpoch(db);
  }

  /** The data's epoch: renewed by a restore or a reset that succeeded (renewEpoch). */
  get epoch() {
    const e = this.#db ? getSetting(this.#db, EPOCH_KEY) : null;
    return typeof e === "string" ? e : this.boot;
  }

  #window(id) {
    const now = Date.now();
    if (now - this.#swept > 3600_000) {
      this.#swept = now;
      for (const [k, v] of this.#mine) if (now - v.seen > FORGET_MS) this.#mine.delete(k);
    }
    let w = this.#mine.get(id);
    if (!w) {
      w = { n: 0, seen: now };
      this.#mine.set(id, w);
    }
    w.seen = now;
    return w;
  }

  /** A change made by window `clientId` — none: by no window (a job's end with no window behind it). */
  note(clientId = null) {
    this.#total += 1;
    if (clientId) this.#window(clientId).n += 1;
  }

  /** Everything changed (a restore, a reset that succeeded — its epoch already renewed): every window asks again. */
  replaced() {
    this.#total += 1;
    if (!this.#db) this.boot = randomUUID();
  }

  /** The count of changes window `clientId` didn't make in this process. */
  revFor(clientId = null) {
    return this.#total - (clientId ? this.#window(clientId).n : 0);
  }

  /** How many windows it remembers (a test reads it). */
  get windows() {
    return this.#mine.size;
  }

  /** Hono middleware: a write to the app's data that succeeded is its window's change. */
  middleware() {
    return async (c, next) => {
      await next();
      if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return;
      if (c.res.status >= 400 || !DATA_WRITES.test(c.req.path)) return;
      this.note(c.req.header("x-client-id") || null);
    };
  }
}
