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
import { get, pushToast, watchSync } from "@delebash/ui";
import { reactive } from "vue";
import { i18n } from "../i18n/index.js";

/** `changes` bumps when another window changed something on the server; `replaced` is set as the window reloads
 *  for data replaced in another (a page's "leave without saving?" lets that reload go: what it held was replaced). */
export const otherWindows = reactive({ changes: 0, replaced: false });

// said once the window has reloaded (the reload itself would take any words with it)
const SAID = "justhousepaint.replacedElsewhere";

const holds = new Set();

/** While `busy()` is true a change waits. Returns the release. */
export function holdChangesWhile(busy) {
  holds.add(busy);
  return () => holds.delete(busy);
}

/** Watch from now on (the boot file, once the server answers). Returns the stop. */
export function watchOtherWindows({ reload = () => window.location.reload() } = {}) {
  try {
    if (sessionStorage.getItem(SAID)) {
      sessionStorage.removeItem(SAID);
      pushToast({ message: i18n.global.t("windows.replaced"), kind: "info" });
    }
  } catch {
    // no session storage (a test, a locked-down browser): nothing to say
  }
  let epoch = null;
  get("/v1/sync/rev")
    .then((r) => {
      epoch ??= r.epoch;
    })
    .catch(() => {});
  return watchSync(
    (r) => {
      if (epoch !== null && r.epoch !== epoch) {
        // the new series first: should anything keep the page (it can't now), it follows the new one, never asks again
        epoch = r.epoch;
        otherWindows.replaced = true;
        try {
          sessionStorage.setItem(SAID, "1");
        } catch {
          // said nowhere: the reload still shows the data as it is now
        }
        return reload();
      }
      epoch = r.epoch;
      otherWindows.changes++;
    },
    { waitWhileEditing: true, waitWhile: () => [...holds].some((busy) => busy()) },
  );
}
