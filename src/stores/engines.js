// SPDX-License-Identifier: MIT
// The two local engines as the screens see them: the part finder (SAM 3, ~3.4 GB) and the AI photo
// (stable-diffusion.cpp + FLUX.2 [klein], ~9 GB) — whether each is installed, and installing it,
// a server job on the task strip (the download runs in the server; the strip's Cancel stops it).
import { get, post } from "@delebash/ui";
import { defineStore } from "pinia";
import { runServerJob } from "../services/jobs.js";

// Each engine's install: its route and its task's feature (literal — EngineInstallCard shows it in
// place with useSurfaceTask, and the family guard's check 17 follows the literals).
const INSTALLS = {
  finder: { path: "/v1/segment/install", feature: "finder.install" },
  aiphoto: { path: "/v1/aiphoto/install", feature: "aiphoto.install" },
};

export const useEnginesStore = defineStore("engines", {
  state: () => ({
    // { installed, downloadBytes, runtime?: { ok, error?, reason? } } — runtime only while not installed (what
    // the engine needs and this computer lacks — the VC++ runtime, its own ONNX Runtime — said before downloading)
    finder: null,
    // { engineInstalled, modelsInstalled, engineMissing?, backend, slow, available, need?, lowMemory?,
    //   downloadBytes } — `need`: what this computer lacks (the VC++ runtime, macOS 26, glibc 2.38), said before
    //   anything downloads; `lowMemory`: { needGb, haveGb }
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
        const { path, feature } = INSTALLS[kind];
        await runServerJob({ start: () => post(path), feature, label });
      } finally {
        this.installing = { ...this.installing, [kind]: false };
        await this.loadStatus().catch(() => {});
      }
    },
  },
});
