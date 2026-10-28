// SPDX-License-Identifier: MIT
// The engines as the screens see them: the part finder (SAM 3, ~3.4 GB) — whether it is installed, and installing
// it, a server job on the task strip (the download runs in the server; the strip's Cancel stops it) — and whether the
// AI photo can run (the kit's readiness for its feature: its engine and model are the kit's sd.cpp runtime's, which
// the kit's "needs its engine" banner installs — the kit's engines plan).
import { get, post } from "@delebash/ui";
import { defineStore } from "pinia";
import { runServerJob } from "../services/jobs.js";

// The part finder's install: its route and its task's feature (literal — EngineInstallCard shows it in
// place with useSurfaceTask, and the family guard's check 17 follows the literals).
const INSTALLS = {
  finder: { path: "/v1/segment/install", feature: "finder.install" },
};

export const useEnginesStore = defineStore("engines", {
  state: () => ({
    // { installed, downloadBytes, runtime?: { ok, error?, reason? } } — runtime only while not installed (what
    // the engine needs and this computer lacks — the VC++ runtime, its own ONNX Runtime — said before downloading)
    finder: null,
    // the kit's readiness for the AI photo's feature: { ready, need, runtime, model, engine, modelState }
    aiphoto: null,
    installing: { finder: false },
  }),
  getters: {
    finderInstalled: (s) => !!s.finder?.installed,
    // known not to be installed: the status has answered and says so (before it answers, or when asking failed,
    // nothing is known — a tool that needs the finder stays on, and the server says why if it must)
    finderMissing: (s) => s.finder != null && !s.finder.installed,
    // the AI photo can run: its engine installed and its model here (the kit's readiness)
    aiphotoReady: (s) => !!s.aiphoto?.ready,
  },
  actions: {
    async loadStatus() {
      const [finder, aiphoto] = await Promise.all([get("/v1/segment/status"), get("/v1/ai/features/aiphoto.render/readiness")]);
      this.finder = finder;
      this.aiphoto = aiphoto;
    },
    /** Download the part finder (`kind`: "finder"); `label` names the task on the strip. */
    async install(kind, label) {
      this.installing = { ...this.installing, [kind]: true };
      try {
        const { path, feature } = INSTALLS[kind];
        await runServerJob({ start: () => post(path), feature, label }).catch((e) => {
          // it finished while the window was away (asleep): finished — the status read next says so (it was said
          // as the error "ended: done" — the nineteenth review)
          if (!(e?.name === "JobEnded" && e.state === "done")) throw e;
        });
      } finally {
        this.installing = { ...this.installing, [kind]: false };
        await this.loadStatus().catch(() => {});
      }
    },
  },
});
