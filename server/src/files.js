// SPDX-License-Identifier: MIT
// Where a house's files live — one folder per house under the data folder, so deleting a house
// is one folder, and the kit's backup takes them as one asset root (`houses/`).
//
//   <dataDir>/houses/<id>/original.<ext>   the photo as added (EXIF orientation applied)
//   <dataDir>/houses/<id>/display.jpg      ≤ the display size — what the screen paints on
//   <dataDir>/houses/<id>/thumb.jpg        the gallery card
//   <dataDir>/houses/<id>/masks/<part>.png one 8-bit mask per part, display size
//   <dataDir>/houses/<id>/renders/<id>.png AI photos

import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

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

export function removeHouseDir(dataDir, id) {
  rmSync(houseDir(dataDir, id), { recursive: true, force: true });
}
