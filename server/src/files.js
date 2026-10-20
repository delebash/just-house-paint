// SPDX-License-Identifier: MIT
// Where a house's files live — one folder per house under the data folder, so deleting a house
// is one folder, and the kit's backup takes them as one asset root (`houses/`).
//
//   <dataDir>/houses/<id>/original.<ext>   the photo as added (EXIF orientation applied)
//   <dataDir>/houses/<id>/display.jpg      ≤ the display size — what the screen paints on
//   <dataDir>/houses/<id>/thumb.jpg        the gallery card
//   <dataDir>/houses/<id>/masks/<part>.png one 8-bit mask per part, display size
//   <dataDir>/houses/<id>/renders/<id>.png AI photos

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { cp, rm } from "node:fs/promises";
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

/** The marks the start-up sweep goes by — only a marked folder of a house that doesn't exist is ever
 *  swept: a removal Windows held, and a photo being added (its house row not written yet). */
const GONE = ".removed";
const ADDING = ".adding";
// the name a reset gives the old houses folder while it is removed (houses.removed-<time>)
const ASIDE = ".removed-";

/** A house's folder made for a photo being added, marked until its row exists (houseAdded). */
export function addingHouseDir(dataDir, id) {
  ensureHouseDirs(dataDir, id);
  writeFileSync(path.join(houseDir(dataDir, id), ADDING), "");
}

/** The photo's house row is written: its folder is a house's like any other. */
export function houseAdded(dataDir, id) {
  rmSync(path.join(houseDir(dataDir, id), ADDING), { force: true });
}

/** One file a house no longer needs (an AI photo deleted, an outline not found again): removed with the
 *  same retries as a folder; one that still can't go is left (a stray file costs nothing), false back. */
export async function removeHouseFile(file) {
  try {
    await rm(file, { force: true, maxRetries: 10, retryDelay: 100 });
    return true;
  } catch (e) {
    log.warning(`${path.basename(file)} couldn't be removed (${e.code || e.message}); left in place`);
    return false;
  }
}

/**
 * Remove a house's folder. Windows holds a file just written for a moment (a scanner, the indexer:
 * a delete right after finding the parts failed with EPERM halfway through, 2026-10-19), so the removal
 * retries for about five seconds (Node's own retries on EBUSY / EPERM / ENOTEMPTY), without holding up
 * the server. Still there: false, and the folder is marked so the start-up sweep takes it — never a
 * half-deleted house left as one. `remove` is node:fs/promises' rm (a test passes one that fails).
 */
export async function removeHouseDir(dataDir, id, { remove = rm } = {}) {
  const dir = houseDir(dataDir, id);
  try {
    await remove(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    return true;
  } catch (e) {
    log.warning(`house ${id}'s folder couldn't be removed (${e.code || e.message}); it is tried again later`);
    try {
      writeFileSync(path.join(dir, GONE), "");
    } catch {
      // not even a mark: the delete route's later retry is the one left
    }
    return false;
  }
}

/**
 * Every house's files (a reset): the houses folder is moved aside at once and an empty one made in its
 * place — a photo added meanwhile goes there, and the next start never takes a restore's leftover for a
 * stopped restore's only copy — then removed with the same retries as one house's, a restore's leftovers
 * with it. Held: each house's folder is marked, and the next start's sweep finishes. Returns whether all
 * of it went now.
 */
export async function removeAllHouseDirs(dataDir, { rename = renameSync } = {}) {
  const root = housesRoot(dataDir);
  // a restore's old or staged copy Windows held (the kit's data_api): the reset takes it too
  const leftovers = existsSync(dataDir) ? readdirSync(dataDir).filter((n) => /^houses\.(replaced|restoring)-/.test(n)) : [];
  for (const name of leftovers) await rm(path.join(dataDir, name), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
  if (!existsSync(root)) {
    try {
      mkdirSync(root, { recursive: true });
    } catch {
      // made by the next photo added (ensureHouseDirs)
    }
    return true;
  }
  const aside = `${root}${ASIDE}${Date.now()}`;
  try {
    rename(root, aside);
  } catch (e) {
    // held as a whole: house by house instead, each with its retries (a held one is marked for the start)
    log.warning(`the houses folder couldn't be moved aside (${e.code || e.message}); removing its houses one by one`);
    let names = [];
    try {
      names = readdirSync(root);
    } catch {
      return false; // not even listed: the next start's sweep has nothing marked, the folder stays
    }
    let all = true;
    for (const name of names) if (SAFE.test(name) && !(await removeHouseDir(dataDir, name))) all = false;
    return all;
  }
  try {
    mkdirSync(root, { recursive: true });
  } catch {
    // made again by the next photo added (ensureHouseDirs)
  }
  try {
    await rm(aside, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    return true;
  } catch (e) {
    log.warning(`the old houses folder is held (${e.code || e.message}); it is removed at the next start`);
    return false;
  }
}

// the file naming a restore's copy a start couldn't put back yet
const PUT_BACK = ".houses-put-back";

/**
 * At start: an AI photo whose job stopped mid-write (the app killed) leaves its picture without a row, and the
 * engine's work folder (`aiphoto-*`) in the temp folder — both go; a work folder only once it is a day old
 * (another copy of the app, on its own data, may be drawing in one). `keep`: houseId → the files its rows name.
 */
export async function sweepRenders(dataDir, keep, { tmp = tmpdir(), now = Date.now() } = {}) {
  let gone = 0;
  for (const [id, files] of keep) {
    const dir = path.join(houseDir(dataDir, id), "renders");
    for (const name of existsSync(dir) ? readdirSync(dir) : []) {
      if (files.has(name)) continue;
      if (await removeHouseFile(path.join(dir, name))) gone++;
    }
  }
  for (const name of existsSync(tmp) ? readdirSync(tmp) : []) {
    if (!name.startsWith("aiphoto-")) continue;
    const dir = path.join(tmp, name);
    try {
      if (now - statSync(dir).mtimeMs < 24 * 3600_000) continue;
    } catch {
      continue;
    }
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  }
  if (gone) log.info(`removed ${gone} AI photo file(s) no AI photo row names`);
  return gone;
}

/** A restore's copy `name` (beside the data) made the houses folder: renamed into place, else — a file in it
 *  held — copied, file by file, into it (a houses folder there already keeps what it has). True when done. */
async function putBack(dataDir, name) {
  const from = path.join(dataDir, name);
  const root = housesRoot(dataDir);
  if (!existsSync(root)) {
    try {
      renameSync(from, root);
      return true;
    } catch {
      // held: copied instead
    }
  }
  try {
    await cp(from, root, { recursive: true, force: false, errorOnExist: false });
    await rm(from, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
    return true;
  } catch (e) {
    log.warning(`the houses folder is missing and ${name} couldn't be put back (${e.code || e.message}); tried again at the next start`);
    return false;
  }
}

/**
 * At start: remove the folders a removal left marked, of houses that don't exist — and an unmarked one
 * only when it is half removed (v0.1.2's leftovers). A whole folder without its house stays: a database
 * lost or replaced must never take every house's photos with it. Returns how many went.
 */
export async function sweepHouseDirs(dataDir, ids) {
  // a reset's old houses folder moved aside, a restore's replaced or staged copy (the kit's data_api),
  // still there because Windows held a file. With no houses folder at all (a restore stopped between its
  // two renames), the newest staged copy — the backup's — or else the replaced one is put back first.
  const all = existsSync(dataDir) ? readdirSync(dataDir) : [];
  const newest = (tag) => all.filter((n) => n.startsWith(`houses${tag}`)).sort().at(-1);
  // a put-back an earlier start couldn't finish names its copy here: never removed as a leftover, tried
  // again (a photo added meanwhile made a new houses folder: the copy's files join it)
  const pending = path.join(dataDir, PUT_BACK);
  const owed = existsSync(pending) ? readFileSync(pending, "utf8").trim() : null;
  const back = existsSync(housesRoot(dataDir)) ? (owed && all.includes(owed) ? owed : null) : (newest(".restoring-") ?? newest(".replaced-"));
  if (back) {
    if (await putBack(dataDir, back)) {
      rmSync(pending, { force: true });
      log.warning(`the houses folder was missing; ${back} put back in its place`);
    } else {
      writeFileSync(pending, back);
      return 0; // nothing removed while the only copy may be beside it
    }
  } else if (owed) {
    rmSync(pending, { force: true }); // its copy is gone: nothing owed
  }
  const leftover = (name) => [ASIDE, ".replaced-", ".restoring-"].some((tag) => name.startsWith(`houses${tag}`));
  for (const name of existsSync(dataDir) ? readdirSync(dataDir) : []) {
    if (leftover(name)) await rm(path.join(dataDir, name), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
  }
  let names = [];
  try {
    names = readdirSync(path.join(dataDir, "houses"));
  } catch {
    return 0; // no houses folder yet
  }
  const keep = new Set(ids);
  // a folder with all three copies of its photo: a house's, whole (a lost database's house stays)
  const whole = (dir) => {
    try {
      return existsSync(path.join(dir, "display.jpg")) && existsSync(path.join(dir, "thumb.jpg")) && readdirSync(dir).some((f) => f.startsWith("original."));
    } catch {
      return true; // not a folder to judge: left
    }
  };
  let gone = 0;
  for (const name of names) {
    const dir = path.join(dataDir, "houses", name);
    if (!SAFE.test(name) || keep.has(name)) continue;
    const marked = existsSync(path.join(dir, GONE)) || existsSync(path.join(dir, ADDING));
    // unmarked, only a half-removed one: v0.1.2 marked nothing, and its delete that Windows stopped halfway
    // left a folder with part of its photo's copies gone
    if (!marked && whole(dir)) continue;
    if (await removeHouseDir(dataDir, name)) gone++;
  }
  if (gone) log.info(`removed ${gone} folder(s) of deleted houses`);
  return gone;
}
