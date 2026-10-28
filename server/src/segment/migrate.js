// SPDX-License-Identifier: MIT
// An older install's part finder files moved into the kit's cache — the kit's engines plan, round C (H4: nobody
// downloads twice). Before the kit held them, the part finder kept SAM 3 and CLIP's tokenizer in `data/models/sam3/`
// (each file checked against its SHA-256 when it downloaded, its stamp `.verified.json` naming each one's size, time
// and hash). At start-up (startup.js) they go into the kit's models cache (the kit's RuntimeService.adoptModel — a
// rename on the same drive, else a copy, the original removed once the copy is whole); a file the stamp vouches for
// (its size, and its time within 2 s — the kit's sameFileTime — unchanged since it was checked) isn't hashed again; the
// folder left empty goes. Best effort: what can't move stays where it is and is tried again at the next start; the
// part finder then offers its download as usual.
import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { sameFileTime } from "@delebash/core/platform/file_time";
import { getLogger } from "@delebash/core/platform/log";
import { getRuntimeService } from "@delebash/core/runner/runtime_service";
import { SAM3 } from "../seed_presets.js";

const log = getLogger("just_house_paint.segment.migrate");

/** Where an older install kept the part finder's model. */
export const oldFinderDir = (dataDir) => path.join(dataDir, "models", "sam3");
const STAMP = ".verified.json";

/**
 * Move an older install's part finder files into the kit's cache. `service` the kit's ONNX runtime, `model` its row (a
 * test's). → adoptFileSet's `{adopted, kept, skipped}`, or null when there was nothing to move.
 */
export async function moveOldFinderFiles(dataDir, { service = getRuntimeService("onnx"), model = SAM3 } = {}) {
  const dir = oldFinderDir(dataDir);
  if (!service || !existsSync(dir)) return null;
  let stamps = {};
  try {
    stamps = JSON.parse(readFileSync(path.join(dir, STAMP), "utf8")) || {};
  } catch {
    stamps = {}; // none: each file is hashed before it moves
  }
  // each file had its name in the cache's path's last part (segment/models.js until round C)
  const nameOf = (f) => path.posix.basename(f.path);
  const sources = Object.fromEntries(model.files.map((f) => [f.sha256, path.join(dir, nameOf(f))]));
  // checked when it downloaded, and unchanged since: the app's word stands (3.4 GB not hashed again)
  const vouched = (f, p) => {
    const seen = stamps[nameOf(f)];
    const st = statSync(p, { throwIfNoEntry: false });
    return !!st && seen?.sha256 === f.sha256 && seen.size === st.size && sameFileTime(seen.mtimeMs, st.mtimeMs);
  };
  const out = await service.adoptModel(model.id, sources, { vouched });
  if (out.adopted.length) log.info(`moved ${out.adopted.length} of the part finder's model files into the kit's models cache`);
  for (const s of out.skipped) if (s.reason !== "missing") log.warning(`a part finder model file stays where it was (${s.reason}): ${s.sha256.slice(0, 12)}…`);
  if (model.files.every((f) => !existsSync(sources[f.sha256]))) {
    rmSync(path.join(dir, STAMP), { force: true });
    rmSync(path.join(dir, `${STAMP}.tmp`), { force: true });
    try {
      if (readdirSync(dir).length === 0) rmdirSync(dir);
      const models = path.dirname(dir);
      if (existsSync(models) && readdirSync(models).length === 0) rmdirSync(models);
    } catch {
      // held a moment, or not empty after all: left for the next start
    }
  }
  return out;
}
