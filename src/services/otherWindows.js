// SPDX-License-Identifier: MIT
// Another window's changes — the desktop app, a browser on the server started on its own, a phone, all on one
// server (the eleventh review, 2026-10-20: an open page read its house once and saved over what another window had
// changed). The kit's watchSync asks the server's counter of the changes OTHER windows made (server/src/changes.js,
// GET /v1/sync/rev — every request carries this window's id: the boot file's installLlmUi `sendClientId`); when it
// moves, `otherWindows.changes` bumps and the pages showing the server's data read it again in place (the house
// page keeps its zoom, its tool and the colors on screen). A restore or a reset — a new series on the server
// (`epoch`) — reloads the window: everything it shows was replaced. A change waits while a dialog is open or the
// cursor is in a text box (the kit's waitWhileEditing), and while a page says it is busy (holdChangesWhile — a
// stroke or its save in flight); it lands at the first check after.
import { get, watchSync } from "@delebash/ui";
import { reactive } from "vue";

/** `changes` bumps when another window changed something on the server. */
export const otherWindows = reactive({ changes: 0 });

const holds = new Set();

/** While `busy()` is true a change waits. Returns the release. */
export function holdChangesWhile(busy) {
  holds.add(busy);
  return () => holds.delete(busy);
}

/** Watch from now on (the boot file, once the server answers). Returns the stop. */
export function watchOtherWindows({ reload = () => window.location.reload() } = {}) {
  let epoch = null;
  get("/v1/sync/rev")
    .then((r) => {
      epoch ??= r.epoch;
    })
    .catch(() => {});
  return watchSync(
    (r) => {
      if (epoch !== null && r.epoch !== epoch) return reload();
      epoch = r.epoch;
      otherWindows.changes++;
    },
    { waitWhileEditing: true, waitWhile: () => [...holds].some((busy) => busy()) },
  );
}
