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
// The versions live in the server's memory (opaque values: a new series at each start, restore and reset — a
// window holding one from before is refused once and reads again). No column, so no migration.

import { randomUUID } from "node:crypto";
import { Mutex } from "@delebash/core/platform/asyncutil";
import { ApiError } from "@delebash/core/platform/errors";

export class Outlines {
  #series = randomUUID().slice(0, 8);
  #n = new Map(); // house id → its outlines' number of changes in this series
  #locks = new Map(); // house id → Mutex

  /** House `id`'s outlines' version, as an ETag (quoted). */
  etag(id) {
    return `"${this.#series}-${this.#n.get(id) ?? 0}"`;
  }

  /** House `id`'s outlines changed: their new version. */
  bump(id) {
    this.#n.set(id, (this.#n.get(id) ?? 0) + 1);
    return this.etag(id);
  }

  /** Every house's outlines replaced (a restore, a reset): every version before is stale. */
  replaced() {
    this.#series = randomUUID().slice(0, 8);
    this.#n.clear();
  }

  /** Refused (412) when `ifMatch` — a request's If-Match — names another version than house `id`'s now. No
   *  If-Match, or `*`: unconditional (RFC 9110). */
  check(id, ifMatch) {
    if (!ifMatch || ifMatch.trim() === "*") return;
    const tags = ifMatch.split(",").map((s) => s.trim().replace(/^W\//, ""));
    if (!tags.includes(this.etag(id))) {
      throw new ApiError(412, "outlines-changed", "This house was changed in another window", "your last change wasn't saved — the house is shown as it is now", {
        houseId: String(id),
      });
    }
  }

  /** `fn` run alone among house `id`'s outline writes. */
  serial(id, fn) {
    let m = this.#locks.get(id);
    if (!m) {
      m = new Mutex();
      this.#locks.set(id, m);
    }
    return m.run(fn);
  }
}
