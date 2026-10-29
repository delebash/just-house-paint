// SPDX-License-Identifier: MIT
// Where a house's files live — one folder per house under the data folder, so deleting a house
// is one folder, and the kit's backup takes them as one asset root (`houses/`).
//
//   <dataDir>/houses/<id>/original.<ext>   the photo as added (EXIF orientation applied)
//   <dataDir>/houses/<id>/display.jpg      ≤ the display size — what the screen paints on
//   <dataDir>/houses/<id>/thumb.jpg        the gallery card
//   <dataDir>/houses/<id>/masks/<part>.png one 8-bit mask per part, display size
//   <dataDir>/houses/<id>/renders/<id>.png AI photos

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { dirSize } from "@delebash/core/platform/dir_size";
import { getLogger } from "@delebash/core/platform/log";
import { renameHeld } from "@delebash/core/platform/rename_held";

const log = getLogger("just_house_paint.files");

const SAFE = /^[A-Za-z0-9_-]+$/;

/** A name that is safe as a folder of its own (houseDir takes it). */
export const isSafeName = (s) => typeof s === "string" && SAFE.test(s);
/** A house's id as the app makes and takes one (schemas/houses.js's Id: 1 to 64 of these characters) — what a restored
 *  backup's houses must hold (data_admin.js checkBackup). */
export const HOUSE_ID = /^[A-Za-z0-9_-]{1,64}$/;

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
/** An AI photo row's file name as the app makes one (`<id>.png`) — its id, or null for any other (a restored backup's
 *  row could hold anything: the twentieth review's answered 500 and couldn't be removed). */
export const renderFileId = (file) => (typeof file === "string" && /^[A-Za-z0-9_-]{1,80}\.png$/.test(file) ? file.slice(0, -4) : null);

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
export async function removeAllHouseDirs(dataDir, { rename = renameHeld } = {}) {
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
    // retried while a file in it is held a moment (an antivirus, the indexer — the kit's renameHeld)
    await rename(root, aside);
  } catch (e) {
    // still held as a whole: house by house instead, each with its retries (a held one is marked for the start)
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

/** At start: an outline a killed save left beside its place (`masks/<part>.png.saving`, written before the rename
 *  that puts it in place) goes — the outline itself is whole. Returns how many went. */
export async function sweepSaving(dataDir, ids) {
  let gone = 0;
  for (const id of ids) {
    const dir = path.join(houseDir(dataDir, id), "masks");
    for (const name of existsSync(dir) ? readdirSync(dir) : []) {
      if (name.endsWith(".saving") && (await removeHouseFile(path.join(dir, name)))) gone++;
    }
  }
  if (gone) log.info(`removed ${gone} outline(s) a stopped save left half written`);
  return gone;
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
      await renameHeld(from, root);
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
 * The folders under houses/ that belong to no house (`ids`: the houses that exist), with their size: a delete
 * Windows stopped before v0.1.3 marked such folders, or a database lost or replaced. The start's sweep keeps a whole
 * one on purpose (it may be a house's only photo), so App Settings → Storage lists them and the user removes them
 * (2026-10-28). A photo being added (marked `.adding`) is no leftover.
 */
export async function strayHouseDirs(dataDir, ids) {
  const root = housesRoot(dataDir);
  const keep = new Set(ids);
  const out = [];
  for (const name of existsSync(root) ? readdirSync(root) : []) {
    const dir = path.join(root, name);
    if (!SAFE.test(name) || keep.has(name) || existsSync(path.join(dir, ADDING))) continue;
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    out.push({ id: name, bytes: await dirSize(dir) });
  }
  return out;
}

/**
 * At start: remove the folders a removal left marked, of houses that don't exist — and an unmarked one
 * only when it is half removed (v0.1.2's leftovers). A whole folder without its house stays: a database
 * lost or replaced must never take every house's photos with it. Returns how many went.
 */
export async function sweepHouseDirs(dataDir, ids) {
  // a reset's old houses folder moved aside, a restore's replaced or staged copy (the kit's data_api),
  // still there because Windows held a file. With no houses folder at all, the newest replaced copy — the old one —
  // is put back; a staged copy (the backup's) never is: a restore swaps the folders before its tables, so the tables
  // are the old ones (one stopped in between is put right by the kit's record before this runs, and tidyAtStart
  // leaves everything while it isn't).
  const all = existsSync(dataDir) ? readdirSync(dataDir) : [];
  const newest = (tag) => all.filter((n) => n.startsWith(`houses${tag}`)).sort().at(-1);
  // a put-back an earlier start couldn't finish names its copy here: never removed as a leftover, tried
  // again (a photo added meanwhile made a new houses folder: the copy's files join it)
  const pending = path.join(dataDir, PUT_BACK);
  const owed = existsSync(pending) ? readFileSync(pending, "utf8").trim() : null;
  // the replaced (old) copy first: a restore swaps the folders before its tables, so one stopped in between left the
  // old tables — and the kit's record puts that right before this runs; this is the fallback
  const back = existsSync(housesRoot(dataDir)) ? (owed && all.includes(owed) ? owed : null) : (newest(".replaced-") ?? null);
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
