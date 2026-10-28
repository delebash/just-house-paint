// SPDX-License-Identifier: MIT
// The engines as the screens see them: whether the part finder and the AI photo can run — the kit's readiness for each
// one's feature (`parts.find`: SAM 3 on the kit's ONNX runtime; `aiphoto.render`: FLUX.2 [klein] on its sd.cpp
// runtime). Their engines and models are the kit's: its "needs its engine" banner (LuEngineNeeded) installs and
// downloads them where they are used, the AI page's Vision and Images tabs too (the kit's engines plan).
import { get } from "@delebash/ui";
import { defineStore } from "pinia";

export const useEnginesStore = defineStore("engines", {
  state: () => ({
    // the kit's readiness for each feature: { ready, need, runtime, model, engine, modelState }
    finder: null,
    aiphoto: null,
  }),
  getters: {
    // known not to run yet: the readiness has answered and says so (before it answers, or when asking failed, nothing
    // is known — a tool that needs the finder stays on, and the server says why if it must)
    finderMissing: (s) => s.finder != null && !s.finder.ready,
    // its model downloading now (the banner's bar on the Parts tab)
    finderDownloading: (s) => s.finder?.modelState?.status === "downloading",
    // what this computer lacks to run it (the banner says what, in words)
    finderBlocked: (s) => s.finder?.need === "engine-cant-run-here",
    // the AI photo can run: its engine installed and its model here
    aiphotoReady: (s) => !!s.aiphoto?.ready,
  },
  actions: {
    async loadStatus() {
      const [finder, aiphoto] = await Promise.all([get("/v1/ai/features/parts.find/readiness"), get("/v1/ai/features/aiphoto.render/readiness")]);
      this.finder = finder;
      this.aiphoto = aiphoto;
    },
  },
});
