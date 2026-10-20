// SPDX-License-Identifier: MIT
// Where a house's files live — one folder per house under the data folder, so deleting a house
// is one folder, and the kit's backup takes them as one asset root (`houses/`).
//
//   <dataDir>/houses/<id>/original.<ext>   the photo as added (EXIF orientation applied)
//   <dataDir>/houses/<id>/display.jpg      ≤ the display size — what the screen paints on
//   <dataDir>/houses/<id>/thumb.jpg        the gallery card
//   <dataDir>/houses/<id>/masks/<part>.png one 8-bit mask per part, display size
//   <dataDir>/houses/<id>/renders/<id>.png AI photos

import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { getLogger } from "@delebash/core/platform/log";

const log = getLogger("just_house_paint.files");

const SAFE = /^[A-Za-z0-9_-]+$/;

/** A path component that came from a request — refuse anything that could leave the folder. */
export function safeName(s) {
  if (!SAFE.test(String(s))) throw new Error(`unsafe file name: ${JSON.stringify(s)}`);
  return String(s);
}

export const housesRoot = (dataDir) => path.join(dataDir, "houses");
export const houseDir = (dataDir, id) => path.join(housesRoot(dataDir), safeName(id));
export const displayPath = (dataDir, id) => path.join(houseDir(dataDir, id), "display.jpg");
export const thumbPath = (dataDir, id) => path.join(houseDir(dataDir, id), "thumb.jpg");
export const originalPath = (dataDir, id, file) => path.join(houseDir(dataDir, id), path.basename(file));
export const maskPath = (dataDir, id, key) => path.join(houseDir(dataDir, id), "masks", `${safeName(key)}.png`);
export const renderPath = (dataDir, id, renderId) => path.join(houseDir(dataDir, id), "renders", `${safeName(renderId)}.png`);

export function ensureHouseDirs(dataDir, id) {
  mkdirSync(path.join(houseDir(dataDir, id), "masks"), { recursive: true });
  mkdirSync(path.join(houseDir(dataDir, id), "renders"), { recursive: true });
}

/**
 * Remove a house's folder. Windows holds a file just written for a moment (a scanner, the indexer:
 * a delete right after finding the parts failed with EPERM halfway through, 2026-10-19), so the removal
 * retries for about five seconds (Node's own retries on EBUSY / EPERM / ENOTEMPTY). Still held: false —
 * the caller leaves it for later (sweepHouseDirs at start, or a retry), never a half-deleted house.
 */
export function removeHouseDir(dataDir, id) {
  try {
    rmSync(houseDir(dataDir, id), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    return true;
  } catch (e) {
    log.warning(`house ${id}'s folder is still held (${e.code || e.message}); it is removed later`);
    return false;
  }
}

/** Remove the folders of houses that no longer exist (`ids`: the houses there are) — a delete whose
 *  folder Windows still held, or a photo added when the server stopped. Returns how many went. */
export function sweepHouseDirs(dataDir, ids) {
  let gone = 0;
  let names = [];
  try {
    names = readdirSync(path.join(dataDir, "houses"));
  } catch {
    return 0; // no houses folder yet
  }
  const keep = new Set(ids);
  for (const name of names) if (SAFE.test(name) && !keep.has(name) && removeHouseDir(dataDir, name)) gone++;
  if (gone) log.info(`removed ${gone} folder(s) of houses that no longer exist`);
  return gone;
}
