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
// it (the clean-slate rule, JustWrite 2026-07-11).

import { rmSync } from "node:fs";
import { LLM_TABLES } from "@delebash/core/llm";
import * as llmDb from "@delebash/core/llm/db";
import { makeDataRouter } from "@delebash/core/platform";
import { sortedTables } from "@delebash/core/platform/data_api";
import { getLogger } from "@delebash/core/platform/log";
import * as lifecycle from "@delebash/core/runner/lifecycle";
import { getDb, getState } from "./app_state.js";
import { dbPath, recreateAppTables } from "./database/index.js";
import { APP_TABLES } from "./database/schema.js";
import { seedWorkspace } from "./database/seed.js";
import { getSetting, setSetting } from "./database/settings.js";
import { housesRoot } from "./files.js";

const log = getLogger("just_house_paint.data");

/** Cancel the jobs, let the part finder and the local AI model go — best effort by design: a
 * reset or restore never fails on its teardown. */
async function teardown() {
  const state = getState();
  try {
    state.jobs?.cancelAll();
    await state.finder?.releaseGpu();
  } catch {
    // best effort, as below
  }
  try {
    await lifecycle.getService().stop();
  } catch {
    // nothing running
  }
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
  rmSync(housesRoot(getState().dataDir), { recursive: true, force: true });
  if (auth !== undefined) setSetting(db, "auth", auth);
  seedWorkspace(db);
  log.info("workspace reset to its first-run state");
}

export const router = (dataDir) =>
  makeDataRouter({
    getDbPath: () => dbPath(dataDir),
    metadata: [APP_TABLES, LLM_TABLES],
    runReset: resetWorkspace,
    assetDirs: () => ({ houses: housesRoot(dataDir) }),
    onReplaced: teardown,
  });
