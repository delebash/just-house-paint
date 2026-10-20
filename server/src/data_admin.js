// SPDX-License-Identifier: MIT
// Settings → Backups' server half: the kit's backup / restore / reset router (makeDataRouter, the
// family's one implementation) over this app's database. One database, two table sets — the app's
// (database/schema.js) and the shared LLM stack's — and one asset folder, `houses/` (each house's
// photo, masks and AI photos). The downloaded engines and models are not in a backup: they come
// back by downloading them again.
//
// Reset is the first-run state: the running jobs are cancelled and the engines let go of the
// graphics card first (no job writes into a house that is about to go, no model keeps running
// under settings that no longer exist), every table is dropped and created again — so a reset also
// recovers from schema drift — the houses' files are deleted, and the seed pass runs. The access
// tokens survive it: a reset on an exposed headless server must not open it to the network. A
// restore replaces the rows and the houses under the running app, so the same teardown runs after
// it (the clean-slate rule, JustWrite 2026-07-11) — and it keeps this server's access tokens too, not
// the backup's (keepAuth).

import { LLM_TABLES } from "@delebash/core/llm";
import * as llmDb from "@delebash/core/llm/db";
import { makeDataRouter, schemaProblem } from "@delebash/core/platform";
import { sortedTables } from "@delebash/core/platform/data_api";
import { getLogger } from "@delebash/core/platform/log";
import * as lifecycle from "@delebash/core/runner/lifecycle";
import { getDb, getState } from "./app_state.js";
import { dbPath, recreateAppTables } from "./database/index.js";
import { APP_TABLES } from "./database/schema.js";
import { SETTING_DEFAULTS, seedWorkspace } from "./database/seed.js";
import { deleteSetting, getSetting, setSetting } from "./database/settings.js";
import { meaningProblem } from "./api/settings_api.js";
import { renewEpoch } from "./changes.js";
import { HOUSE_ID, housesRoot, removeAllHouseDirs, renderFileId } from "./files.js";
import { PART_KEY } from "./schemas/houses.js";
import { SETTINGS } from "./schemas/settings.js";

const log = getLogger("just_house_paint.data");

/** A restore keeps this server's access tokens, as a reset does: they are the server's, not the data's —
 *  a backup made before a token was set would open the server to the network, one with another token
 *  lock every client out. The kit's restore runs both inside its transaction. */
let keptAuth;
export const keepAuth = {
  beforeCopy: (h) => {
    keptAuth = getSetting(h, "auth");
  },
  afterCopy: (h) => {
    if (keptAuth === undefined) deleteSetting(h, "auth");
    else setSetting(h, "auth", keptAuth);
  },
  // and a backup carries none: a file shared or left somewhere never hands out a way in
  scrubBackup: (h) => deleteSetting(h, "auth"),
};

/** A backup's own rules, on its unpacked database before anything is replaced (the kit's checkBackup — the
 *  nineteenth review: a restored house id that isn't a safe folder name made the next start fail): every house's id
 *  is one the app makes (HOUSE_ID). A throw is the restore's refusal, in these words. (Its settings never refuse it —
 *  an older version's backup restores: resetUnfitSettings.) */
export function checkBackup(h) {
  const has = (t) => !!h.one("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [t]);
  const named = (v) => JSON.stringify(String(v)).slice(0, 60);
  if (!has("houses")) return;
  for (const { id } of h.all("SELECT id FROM houses")) {
    if (typeof id !== "string" || !HOUSE_ID.test(id)) {
      throw new Error(`its houses include one whose id isn't a safe folder name (${named(id)}) — this backup can't be restored`);
    }
  }
  // and every other name a file is made from (the twentieth review): a part's key (its mask), an AI photo's file
  const partKey = new RegExp(PART_KEY);
  if (has("parts")) {
    for (const { key } of h.all("SELECT DISTINCT key FROM parts")) {
      if (typeof key !== "string" || !partKey.test(key)) throw new Error(`its parts include one whose name isn't a safe file name (${named(key)}) — this backup can't be restored`);
    }
  }
  if (has("renders")) {
    for (const { file } of h.all("SELECT file FROM renders")) {
      if (!renderFileId(file)) throw new Error(`its AI photos include one whose file name isn't one the app makes (${named(file)}) — this backup can't be restored`);
    }
  }
}

/** A number JSON can't say again: 1e400 parses as Infinity and reads back as null. */
function hasNonFinite(v) {
  if (typeof v === "number") return !Number.isFinite(v);
  return !!v && typeof v === "object" && Object.values(v).some(hasNonFinite);
}

/** The restored settings rows that don't fit this version — its schemas (schemas/settings.js) and the checks the
 *  Settings screen makes (settings_api.js meaningProblem): a value out of today's range, of another shape, unreadable,
 *  a number past what JSON says, a mistake that would only show later — set back to their defaults (the seed's), inside the restore's transaction;
 *  returns their keys, which the restore's answer names (`resetSettings`) so the screen can say so. A backup from an
 *  older version always restores (the help: it gets this one's settings at once). */
export function resetUnfitSettings(h) {
  const reset = [];
  for (const { key, value } of h.all("SELECT key, value FROM settings")) {
    if (!Object.hasOwn(SETTINGS, key)) continue; // the preferences, the tokens, the kit's own rows
    let v;
    let fits = true;
    try {
      v = JSON.parse(value);
    } catch {
      fits = false;
    }
    if (fits && !schemaProblem(SETTINGS[key], v) && !hasNonFinite(v) && !meaningProblem(key, v)) continue;
    if (Object.hasOwn(SETTING_DEFAULTS, key)) setSetting(h, key, SETTING_DEFAULTS[key]);
    else deleteSetting(h, key); // (every setting is seeded; the seed after the restore fills a missing one)
    reset.push(key);
  }
  return reset;
}

/** Cancel the jobs and wait for them to end, let the part finder and the local AI model go — best effort by design:
 * a reset or restore never fails on its teardown. Before a restore replaces anything (beforeReplace) and after it
 * (onReplaced). */
async function teardown() {
  const state = getState();
  try {
    await state.jobs?.cancelAll();
    // a CPU inference the finder is in the middle of: waited for, at most 30 s (the restore waits on this)
    await Promise.race([state.finder?.releaseGpu(), new Promise((r) => setTimeout(r, 30_000).unref?.())]);
  } catch {
    // best effort, as below
  }
  try {
    await lifecycle.getService().stop();
  } catch {
    // nothing running
  }
}

/** The data replaced: every window reloads (changes.js — the data's epoch) — only once it has been (a refused restore
 *  changed nothing: no window reloads for it). */
function replaced() {
  getState().changes?.replaced();
}

/** Back to the first-run state (POST /v1/data/reset). */
export async function resetWorkspace() {
  const db = getDb();
  await teardown();
  const auth = getSetting(db, "auth");
  // the LLM stack's tables, children before parents, then created again
  db.tx(() => {
    for (const t of [...sortedTables(LLM_TABLES)].reverse()) db.exec(`DROP TABLE IF EXISTS "${t}"`);
  });
  llmDb.createAll(db);
  recreateAppTables(db, APP_TABLES);
  // the tokens and the seed are back before anything can wait: nothing else runs until here, and the
  // houses' files go last (removing them yields to other requests — never with the tokens gone)
  if (auth !== undefined) setSetting(db, "auth", auth);
  seedWorkspace(db);
  // the data's new epoch before anything can ask (no await since the tables were made again)
  renewEpoch(db);
  await removeAllHouseDirs(getState().dataDir);
  replaced();
  log.info("workspace reset to its first-run state");
}

export const router = (dataDir, { gate } = {}) =>
  makeDataRouter({
    getDbPath: () => dbPath(dataDir),
    metadata: [APP_TABLES, LLM_TABLES],
    runReset: resetWorkspace,
    assetDirs: () => ({ houses: housesRoot(dataDir) }),
    ...keepAuth,
    checkBackup,
    // and the data's new epoch, in the same transaction as the restored rows (the backup's own row replaced); the
    // settings an older backup holds that don't fit this version set back to their defaults, named in the answer
    afterCopy: (h) => {
      keepAuth.afterCopy(h);
      renewEpoch(h);
      return { resetSettings: resetUnfitSettings(h) };
    },
    // a backup from an older version: its settings get what this one's seed adds and upgrades (as at start)
    afterTables: () => seedWorkspace(getDb()),
    // what would write into the data being replaced stops before it is (the gate is closed by then), and what was
    // derived from the old data after
    beforeReplace: teardown,
    onReplaced: async () => {
      replaced();
      await teardown();
    },
    gate,
  });
