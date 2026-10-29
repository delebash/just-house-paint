// SPDX-License-Identifier: MIT
// What the house-paint routes share, on the app state (app_state.js): the job registry, the other
// windows' changes (the kit's ChangeCounter), the houses' outline versions (outlines.js), the part
// finder (SAM 3 on the kit's ONNX runtime), the AI photo (the kit's stable-diffusion.cpp runtime), the brands' public
// lists (the kit's fetch), the AI run path (the kit's runAction), and readers of the settings they use — read on every
// call, so a change in Settings applies to the next run without a restart. Tests pass their own `finder`, `aiphoto`,
// `fetch` or `run`.

import { buildLlmConfig, runAction, stores } from "@delebash/core/llm";
import { ChangeCounter, JobRegistry } from "@delebash/core/platform";
import * as http from "@delebash/core/platform/http";
import * as hardware from "@delebash/core/runner/hardware";
import { createAiPhoto, sharedGpuNote, surfaceWords } from "./aiphoto_service.js";
import { SETTING_DEFAULTS } from "./database/seed.js";
import { getSetting } from "./database/settings.js";
import { createFinder } from "./finder.js";
import { Outlines } from "./outlines.js";

const MB = 1e6;

export function createServices({ db, dataDir }, overrides = {}) {
  const setting = (key) => getSetting(db, key) ?? SETTING_DEFAULTS[key];

  const finder =
    overrides.finder ??
    // SAM 3 on the kit's in-process ONNX runtime (the feature parts.find: its preset says where it runs, the AI page's
    // Vision tab how long it stays in memory)
    createFinder({
      dataDir,
      partsConfig: () => setting("finder.parts"),
      priority: () => setting("finder.priority"),
      houseMargin: () => setting("finder.houseMargin"),
      houseMinShare: () => setting("finder.houseMinShare"),
    });

  const aiphoto =
    overrides.aiphoto ??
    createAiPhoto({
      dataDir,
      settings: {
        // a number: the target pixel count (aiphoto/edit.js sizes the photo to it)
        workingSize: () => setting("aiphoto.workingPixels"),
        compose: () => setting("aiphoto.compose"),
        templates: () => setting("aiphoto.templates"),
        // the most pixels the AI photo composes at (Settings → General, as Save image)
        fullSizeMaxPixels: () => setting("photos.fullSizeMaxMegapixels") * 1e6,
      },
    });

  const changes = overrides.changes ?? new ChangeCounter();
  return {
    changes,
    outlines: overrides.outlines ?? new Outlines({ db }),
    // a job's end is a change by the window that started it (its page reads the result itself)
    jobs: new JobRegistry({ onFinish: (job) => changes.note(job.clientId) }),
    // how often a window asks whether another window changed something (GET /v1/sync/rev)
    checkSeconds: () => setting("windows.checkSeconds"),
    finder,
    aiphoto,
    // the brands' lists through the kit's one HTTP client, as the downloads: it honours HTTPS_PROXY / NO_PROXY
    // (Node's own fetch ignores them — the brand lists failed behind a proxy the model downloads went through)
    fetch: overrides.fetch ?? ((...a) => http.fetch(...a)),
    run: overrides.run ?? ((body, opts) => runAction(stores.getPromptStore(), buildLlmConfig(), body, opts)),
    limits: () => ({
      displayMax: setting("photos.displayMax"),
      thumbMax: setting("photos.thumbMax"),
      jpegQuality: setting("photos.jpegQuality"),
      maxPhotoBytes: setting("photos.maxMegabytes") * MB,
    }),
    /** Other programs holding the graphics card while the AI photo draws, when they hold more than the
     *  setting: { mb, programs: [label] } (the biggest three), or null — none, under it, or not
     *  measurable here (the kit's otherGpuHolders: nvidia-smi, else Windows' counters). */
    sharedGpu:
      overrides.sharedGpu ??
      (async () => {
        const floor = setting("aiphoto.sharedGpuNoteMb");
        return floor ? sharedGpuNote(await hardware.otherGpuHolders().catch(() => null), floor) : null;
      }),
    maxDesignsPerHouse: () => setting("designs.maxPerHouse"),
    // the finishes a part's paint can have (PATCH /v1/houses/:id/finishes takes one of them)
    finishes: () => setting("paints.finishes"),
    maxImportBytes: () => setting("paints.maxImportMegabytes") * MB,
    harmony: () => setting("schemes.harmony"),
    colorOrder: () => setting("paints.colorOrder"),
    // the English the AI's prompt reads ("garageDoor" → "garage door")
    partLabel: surfaceWords,
  };
}
