// SPDX-License-Identifier: MIT
// What the server tidies when it starts, before it listens (serve.js): the house folders a removal left
// (files.js sweepHouseDirs), the AI photos a killed job left without a row (sweepRenders), outlines a killed save
// left half written (sweepSaving) and the kit's backup and restore work folders — those also once a day while it
// runs (tidyNowAndThen). Its own module so a test runs exactly what the start runs.

import { restoreUnfinished, sweepWorkFolders } from "@delebash/core/platform/data_api";
import { getLogger } from "@delebash/core/platform/log";
import { dbPath } from "./database/index.js";
import { listHouses, listRenders } from "./database/houses.js";
import { sweepHouseDirs, sweepRenders, sweepSaving } from "./files.js";

const log = getLogger("just_house_paint.startup");

/** Tidy `dataDir` against the database `db`'s houses and their AI photos' rows. */
export async function tidyAtStart(dataDir, db) {
  // a restore the kit couldn't finish or undo yet: its folders are the only copies — nothing is touched until a start
  // puts them back
  if (restoreUnfinished(dbPath(dataDir))) {
    log.warning("a restore didn't finish: the houses' folders are left as they are until it does");
    return;
  }
  sweepWorkFolders(dbPath(dataDir));
  const houses = listHouses(db).map((h) => h.id);
  await sweepHouseDirs(dataDir, houses);
  await sweepSaving(dataDir, houses);
  await sweepRenders(dataDir, new Map(houses.map((id) => [id, new Set(listRenders(db, id).map((r) => r.file))])));
}

/** While the server runs (a headless one up for weeks): the kit's work folders a stopped backup or restore left, once
 *  a day — the rest waits for the next start (a house folder being added or removed is never judged while it runs). */
export function tidyNowAndThen(dataDir, { everyMs = 24 * 3600_000 } = {}) {
  const timer = setInterval(() => {
    try {
      const gone = sweepWorkFolders(dbPath(dataDir));
      if (gone) log.info(`removed ${gone} work folder(s) a stopped backup or restore left`);
    } catch {
      // tried again tomorrow
    }
  }, everyMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
