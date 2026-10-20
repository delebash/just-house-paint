// SPDX-License-Identifier: MIT
// What the house-paint routes share, on the app state (app_state.js): the job registry, the part
// finder (SAM 3), the AI photo (stable-diffusion.cpp), the brands' public lists (fetch), the
// downloads (the kit's streamDownload), the AI run path (the kit's runAction), and readers of the
// settings they use — read on every call, so a change in Settings applies to the next run without
// a restart. Tests pass their own `finder`, `aiphoto`, `fetch`, `download` or `run`.

import path from "node:path";
import { buildLlmConfig, resolveRoute, runAction, stores } from "@delebash/core/llm";
import { streamDownload } from "@delebash/core/runner/download";
import * as hardware from "@delebash/core/runner/hardware";
import * as lifecycle from "@delebash/core/runner/lifecycle";
import { hfDownloadHeaders } from "@delebash/core/runner/models";
import { createAiPhoto, sharedGpuNote, surfaceWords } from "./aiphoto_service.js";
import { SETTING_DEFAULTS } from "./database/seed.js";
import { getSetting } from "./database/settings.js";
import { createFinder, DEFAULT_PROVIDERS } from "./finder.js";
import { JobRegistry } from "./jobs.js";

/** Where the engines and their models live, in the data folder (an uninstall takes them along). */
export const finderModelDir = (dataDir) => path.join(dataDir, "models", "sam3");
export const aiphotoModelDir = (dataDir) => path.join(dataDir, "models", "flux2-klein");
export const aiphotoEngineDir = (dataDir) => path.join(dataDir, "engines", "sdcpp");

const MB = 1e6;

/** A download through the kit's resumable streamDownload; Hugging Face gets the user's token. */
const kitDownload = (url, dest, opts = {}) =>
  streamDownload(url, dest, { ...opts, headers: url.startsWith("https://huggingface.co/") ? hfDownloadHeaders() : null });

/** Stop the local AI model (best effort) — the AI photo needs the graphics card's memory. */
async function stopLocalModel() {
  try {
    await lifecycle.getService().stop();
  } catch {
    // nothing running, or the runner never started — either way the memory is free
  }
}

export function createServices({ db, dataDir }, overrides = {}) {
  const setting = (key) => getSetting(db, key) ?? SETTING_DEFAULTS[key];
  const detectGpu = () => hardware.detect();

  const finder =
    overrides.finder ??
    createFinder({
      dataDir,
      modelDir: finderModelDir(dataDir),
      // read when the finder loads (after a release, the next use reads it again)
      get providers() {
        return { ...DEFAULT_PROVIDERS, image: setting("finder.useGpu") ? "auto" : "cpu" };
      },
      partsConfig: () => setting("finder.parts"),
      priority: () => setting("finder.priority"),
      idleMs: () => setting("finder.idleMinutes") * 60_000,
      houseMargin: () => setting("finder.houseMargin"),
      houseMinShare: () => setting("finder.houseMinShare"),
    });

  const aiphoto =
    overrides.aiphoto ??
    createAiPhoto({
      dataDir,
      engineDir: aiphotoEngineDir(dataDir),
      modelDir: aiphotoModelDir(dataDir),
      finder,
      detectGpu,
      stopLocalModel,
      settings: {
        // a number: the target pixel count (aiphoto/edit.js sizes the photo to it)
        workingSize: () => setting("aiphoto.workingPixels"),
        compose: () => setting("aiphoto.compose"),
        templates: () => setting("aiphoto.templates"),
        // the most pixels the AI photo composes at (Settings → General, as Save image)
        fullSizeMaxPixels: () => setting("photos.fullSizeMaxMegapixels") * 1e6,
      },
    });

  return {
    jobs: new JobRegistry(),
    finder,
    aiphoto,
    fetch: overrides.fetch ?? ((...a) => globalThis.fetch(...a)),
    download: overrides.download ?? kitDownload,
    run: overrides.run ?? ((body) => runAction(stores.getPromptStore(), buildLlmConfig(), body)),
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
    maxImportBytes: () => setting("paints.maxImportMegabytes") * MB,
    harmony: () => setting("schemes.harmony"),
    // an AI feature runs on the bundled local model (it would load on the graphics card) — not a cloud one
    usesLocalAi: (feature) => {
      try {
        return resolveRoute(buildLlmConfig(), feature, { action: feature })[0]?.provider_type === "local-llamacpp";
      } catch {
        return false; // not set up: the run fails on its own, with its own message
      }
    },
    colorOrder: () => setting("paints.colorOrder"),
    // the English the AI's prompt reads ("garageDoor" → "garage door")
    partLabel: surfaceWords,
  };
}
