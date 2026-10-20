// SPDX-License-Identifier: MIT
// What the server tidies when it starts, before it listens (serve.js): the house folders a removal left
// (files.js sweepHouseDirs) and the AI photos a killed job left without a row (sweepRenders). Its own
// module so a test runs exactly what the start runs.

import { listHouses, listRenders } from "./database/houses.js";
import { sweepHouseDirs, sweepRenders } from "./files.js";

/** Tidy `dataDir` against the database `db`'s houses and their AI photos' rows. */
export async function tidyAtStart(dataDir, db) {
  const houses = listHouses(db).map((h) => h.id);
  await sweepHouseDirs(dataDir, houses);
  await sweepRenders(dataDir, new Map(houses.map((id) => [id, new Set(listRenders(db, id).map((r) => r.file))])));
}
