// SPDX-License-Identifier: MIT
// The two local engines as the screens see them: the part finder (SAM 3, ~3.4 GB) and the AI photo
// (stable-diffusion.cpp + FLUX.2 [klein], ~9 GB) — whether each is installed, and installing it,
// a server job on the task strip (the download runs in the server; the strip's Cancel stops it).
import { get, post } from "@delebash/ui";
import { defineStore } from "pinia";
import { runServerJob } from "../services/jobs.js";

export const useEnginesStore = defineStore("engines", {
  state: () => ({
    // { installed, downloadBytes }
    finder: null,
    // { engineInstalled, modelsInstalled, backend, slow, downloadBytes }
    aiphoto: null,
    installing: { finder: false, aiphoto: false },
  }),
  getters: {
    finderInstalled: (s) => !!s.finder?.installed,
    aiphotoInstalled: (s) => !!(s.aiphoto?.engineInstalled && s.aiphoto?.modelsInstalled),
  },
  actions: {
    async loadStatus() {
      const [finder, aiphoto] = await Promise.all([get("/v1/segment/status"), get("/v1/aiphoto/status")]);
      this.finder = finder;
      this.aiphoto = aiphoto;
    },
    /** Download an engine (`kind`: "finder" | "aiphoto"); `label` names the task on the strip. */
    async install(kind, label) {
      this.installing = { ...this.installing, [kind]: true };
      try {
        const path = kind === "finder" ? "/v1/segment/install" : "/v1/aiphoto/install";
        await runServerJob({ start: () => post(path), feature: `${kind}.install`, label });
      } finally {
        this.installing = { ...this.installing, [kind]: false };
        await this.loadStatus().catch(() => {});
      }
    },
  },
});
