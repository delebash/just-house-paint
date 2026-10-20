// SPDX-License-Identifier: MIT
// The refusals more than one area gives (the kit's ApiError, its words for the screen).
import { ApiError } from "@delebash/core/platform/errors";

/** A house that isn't there — deleted in another window or tab, or by a reset. Its id goes along, so a
 *  page can tell its own house is gone (not a part or a file of it) and say so in place of a toast. */
export const houseNotFound = (id) =>
  new ApiError(404, "house-not-found", "This house isn't here any more", "it was deleted — in another window, or by a reset", { houseId: String(id) });
