// SPDX-License-Identifier: MIT
// An older install's AI photo files moved into the kit's cache — the kit's engines plan, H4: nobody downloads twice.
// Before the kit held them, the AI photo kept its model in `data/models/flux2-klein/` (each file checked against its
// SHA-256 when it downloaded, its manifest `.aiphoto-models.json` naming each one's hash, size and time) and its engine
// in `data/engines/sdcpp/<release>/<backend>/`. At start-up (startup.js):
//   - the model's files go into the kit's models cache (the kit's RuntimeService.adoptModel — a rename on the same
//     drive, else a copy, the original removed once the copy is whole); a file the manifest vouches for (its size,
//     and its time within 2 s — the kit's sameFileTime — unchanged since it was checked) isn't hashed again;
//   - the old engine build goes, untouched, into the kit's sd.cpp folder: it can't serve the kit's pinned build (the
//     plan's round B decisions), and the kit's install of that build sweeps it — llama.cpp's rule, an update replaces
//     the old build;
//   - the folders left empty go.
// Best effort: what can't move stays where it is and is tried again at the next start; the AI photo then offers its
// download as usual.
import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { sameFileTime } from "@delebash/core/platform/file_time";
import { getLogger } from "@delebash/core/platform/log";
import { renameHeld } from "@delebash/core/platform/rename_held";
import { getRuntimeService } from "@delebash/core/runner/runtime_service";
import { FLUX2_KLEIN } from "../seed_presets.js";

const log = getLogger("just_house_paint.aiphoto.migrate");

/** Where an older install kept the AI photo's model and engine. */
export const oldModelDir = (dataDir) => path.join(dataDir, "models", "flux2-klein");
export const oldEngineDir = (dataDir) => path.join(dataDir, "engines", "sdcpp");
/** The name each model file had there, by its sd-server slot. */
const OLD_NAMES = Object.freeze({ diffusion_model: "flux-2-klein-4b-Q8_0.gguf", llm: "Qwen3-4B-Q8_0.gguf", vae: "flux2-klein-vae.safetensors" });
const MANIFEST = ".aiphoto-models.json";

/** A folder that holds nothing any more goes (best effort). */
function dropIfEmpty(dir) {
  try {
    if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
  } catch {
    // held a moment, or not empty after all: left for the next start
  }
}

/**
 * Move an older install's AI photo files into the kit's cache. `service` the kit's sd.cpp runtime, `model` its row (a
 * test's).
 * → `{ models: adoptFileSet's {adopted, kept, skipped} | null, engine: [the builds moved] }`.
 */
export async function moveOldAiPhotoFiles(dataDir, { service = getRuntimeService("sdcpp"), model = FLUX2_KLEIN } = {}) {
  const out = { models: null, engine: [] };
  if (!service) return out;

  const modelDir = oldModelDir(dataDir);
  if (existsSync(modelDir)) {
    let manifest = {};
    try {
      manifest = JSON.parse(readFileSync(path.join(modelDir, MANIFEST), "utf8")) || {};
    } catch {
      manifest = {}; // none: each file is hashed before it moves
    }
    const sources = Object.fromEntries(model.files.map((f) => [f.sha256, path.join(modelDir, OLD_NAMES[f.slot])]));
    // checked when it downloaded, and unchanged since: the app's word stands (9 GB not hashed again)
    const vouched = (f, p) => {
      const seen = manifest[OLD_NAMES[f.slot]];
      const st = statSync(p, { throwIfNoEntry: false });
      return !!st && seen?.sha256 === f.sha256 && seen.size === st.size && sameFileTime(seen.mtimeMs, st.mtimeMs);
    };
    out.models = await service.adoptModel(model.id, sources, { vouched });
    if (out.models.adopted.length) log.info(`moved ${out.models.adopted.length} of the AI photo's model files into the kit's models cache`);
    for (const s of out.models.skipped) if (s.reason !== "missing") log.warning(`an AI photo model file stays where it was (${s.reason}): ${s.sha256.slice(0, 12)}…`);
    if (model.files.every((f) => !existsSync(sources[f.sha256]))) {
      rmSync(path.join(modelDir, MANIFEST), { force: true });
      dropIfEmpty(modelDir);
    }
  }

  const engineDir = oldEngineDir(dataDir);
  if (existsSync(engineDir)) {
    for (const d of readdirSync(engineDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const to = path.join(service.root, d.name);
      if (existsSync(to)) continue; // a build of that name already there: the kit's own — never overwritten
      try {
        await mkdir(service.root, { recursive: true });
        await renameHeld(path.join(engineDir, d.name), to);
        out.engine.push(d.name);
      } catch (e) {
        // on another drive the rename can't move it, and a copy of a build the kit replaces isn't worth it: it stays
        log.warning(`the AI photo's old engine folder ${d.name} stays where it was: ${e?.code === "EXDEV" ? "the kit's cache is on another drive" : e?.message || e}`);
      }
    }
    if (out.engine.length) log.info(`moved the AI photo's old engine build(s) ${out.engine.join(", ")} into the kit's engine folder`);
    dropIfEmpty(engineDir);
    dropIfEmpty(path.dirname(engineDir));
  }
  return out;
}
