// SPDX-License-Identifier: MIT
// A house's outlines (its parts' masks), versioned and written one at a time. A stroke saved the page's whole
// outline from what the page last read: a window opened earlier undid another window's Box and two parts claimed
// the same pixels; and Box read every outline, then saved, while a stroke's save landed in between (the eleventh
// review, 2026-10-20). The standard: HTTP conditional requests (RFC 9110 §13.1.1) — the house's outlines carry a
// version (an ETag), a write sends the version it was made on (If-Match), and one made on an older version is
// refused (412 Precondition Failed); the page reads the outlines again. One version per house, not per part: a
// stroke on one part takes its pixels from the others. The writes themselves run one at a time per house (the
// kit's Mutex).
//
// The version is the database's: a hash of the house's parts rows (each outline write changes its part's
// updated_at and area, a find all of them and the house's parts_found_at). It stays while the outlines do — a
// server started again (the tray's Restart, a reboot) refused every window's next stroke when it was a counter in
// memory (the twelfth review) — and a restore of the same data gives the same one (RFC 9110 §8.8.3). The version and
// its check are the kit's (`platform/versions`, app-structure §19, "A write made on what another window already
// changed").

import { Mutex } from "@delebash/core/platform/asyncutil";
import { checkIfMatch, etagOf } from "@delebash/core/platform/versions";
import { outlinesState } from "./database/houses.js";

export class Outlines {
  #db;
  #locks = new Map(); // house id → Mutex, while a write holds or waits for it

  /** `db`: the app's database handle (the parts rows the version is made from). */
  constructor({ db }) {
    this.#db = db;
  }

  /** House `id`'s outlines' version, as an ETag (quoted). */
  etag(id) {
    return etagOf(outlinesState(this.#db, id));
  }

  /** Refused (412) when `ifMatch` — a request's If-Match — names another version than house `id`'s now. No
   *  If-Match, or `*`: unconditional; a weak tag never matches (If-Match compares strongly — RFC 9110 §13.1.1). */
  check(id, ifMatch) {
    checkIfMatch(ifMatch, this.etag(id), {
      type: "outlines-changed",
      title: "This house was changed in another window",
      detail: "your last change wasn't saved — the house is shown as it is now",
      extra: { houseId: String(id) },
    });
  }

  /** `fn` run alone among house `id`'s outline writes (the lock goes once none holds or waits for it). */
  async serial(id, fn) {
    let lock = this.#locks.get(id);
    if (!lock) {
      lock = { m: new Mutex(), n: 0 };
      this.#locks.set(id, lock);
    }
    lock.n += 1;
    try {
      return await lock.m.run(fn);
    } finally {
      lock.n -= 1;
      if (!lock.n) this.#locks.delete(id);
    }
  }

  /** How many houses have a write holding or waiting (a test reads it). */
  get held() {
    return this.#locks.size;
  }
}
