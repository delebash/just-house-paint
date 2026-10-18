// SPDX-License-Identifier: MIT
// Application-wide state — the family setState/getState seam (JW, JV, docgen): the data folder,
// the open database and the house-paint services (services.js — the jobs, the part finder, the AI
// photo, the settings readers), set once by createApp and read by the routes.

import { RuntimeError } from "@delebash/core/platform/py";

export class AppState {
  /**
   * @param {string} dataDir  @param {object} db the kit's database handle (platform/sql.js)
   * @param {object} services services.js createServices — each becomes a field (`state.jobs`, …)
   */
  constructor(dataDir, db, services = {}) {
    this.dataDir = dataDir;
    this.db = db;
    Object.assign(this, services);
  }
}

let STATE = null;

export function setState(state) {
  STATE = state;
}

export function getState() {
  if (STATE === null) throw new RuntimeError("AppState not initialized — call setState() during boot");
  return STATE;
}

/** The open database (the stores take it as their first argument). */
export const getDb = () => getState().db;
