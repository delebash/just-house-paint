// SPDX-License-Identifier: MIT
// An older install's part finder files moved into the kit's cache at start-up (segment/migrate.js — the kit's engines
// plan, round C: nobody downloads twice): SAM 3's and CLIP's tokenizer's files adopted by the kit's ONNX runtime
// (vouched for by the old folder's stamp, else hashed), the emptied folders gone. On the kit's real RuntimeService over
// a temp cache, with a small model row of the same shape (two repos, the files' old names their paths' last part).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RuntimeService } from "@delebash/core/runner/runtime_service";
import { afterEach, beforeEach, expect, test } from "vitest";
import { moveOldFinderFiles, oldFinderDir } from "../../src/segment/migrate.js";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const BODIES = { image: Buffer.from("image encoder"), decoder: Buffer.from("decoder"), decoder_data: Buffer.from("decoder weights"), tokenizer: Buffer.from("{}") };
const AT = { image: "sam3/sam3_image_encoder.onnx", decoder: "sam3/sam3_decoder.onnx", decoder_data: "sam3/sam3_decoder.onnx.data", tokenizer: "tokenizer.json" };
const MODEL = {
  runtime: "onnx",
  id: "sam3",
  name: "SAM 3",
  files: Object.entries(BODIES).map(([slot, body]) => ({ slot, repo: slot === "tokenizer" ? "org/clip" : "org/sam", revision: "abc123", path: AT[slot], sha256: sha(body), bytes: body.length })),
};
const oldName = (f) => path.posix.basename(f.path);

let dataDir;
let cache;
let svc;
beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "hp-migrate-data-"));
  cache = mkdtempSync(path.join(tmpdir(), "hp-migrate-cache-"));
  svc = new RuntimeService({
    id: "onnx",
    cacheRoot: cache,
    configFn: () => ({ idleSeconds: 0 }),
    hardwareFn: () => ({ platform: "windows", runtimes: {}, gpus: [] }),
    modelsFn: () => [MODEL],
  });
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(cache, { recursive: true, force: true });
});

/** The older install's model folder: the files, and its stamp when `stamp`. */
function oldFinder({ stamp = true } = {}) {
  const dir = oldFinderDir(dataDir);
  mkdirSync(dir, { recursive: true });
  const stamps = {};
  for (const f of MODEL.files) {
    const p = path.join(dir, oldName(f));
    writeFileSync(p, BODIES[f.slot]);
    const st = statSync(p);
    stamps[oldName(f)] = { size: st.size, mtimeMs: st.mtimeMs, sha256: f.sha256 };
  }
  if (stamp) writeFileSync(path.join(dir, ".verified.json"), JSON.stringify(stamps));
  return dir;
}

test("the files move into the kit's cache — vouched for by the old stamp; the old folders go", async () => {
  const dir = oldFinder();
  const r = await moveOldFinderFiles(dataDir, { service: svc, model: MODEL });
  expect(r).toEqual({ adopted: MODEL.files.map((f) => f.sha256), kept: [], skipped: [] });
  expect(existsSync(dir)).toBe(false); // the files moved, the stamp and the folder gone
  expect(existsSync(path.join(dataDir, "models"))).toBe(false);
  expect(svc.modelsStatus()[0].onDisk).toBe(true);
  // the decoder's weights beside it, where ONNX Runtime reads them
  const files = svc.modelFor(MODEL.id).files;
  expect(path.dirname(files.decoder_data)).toBe(path.dirname(files.decoder));
  expect(readFileSync(files.decoder_data).equals(BODIES.decoder_data)).toBe(true);
  // a second start finds nothing to move
  expect(await moveOldFinderFiles(dataDir, { service: svc, model: MODEL })).toBeNull();
});

test("without the stamp each file is checked against its pin first; one that isn't what it says stays", async () => {
  const dir = oldFinder({ stamp: false });
  writeFileSync(path.join(dir, "sam3_decoder.onnx"), "decodeR"); // the right size, the wrong bytes
  const r = await moveOldFinderFiles(dataDir, { service: svc, model: MODEL });
  expect(r.skipped).toEqual([{ sha256: MODEL.files[1].sha256, reason: "checksum" }]);
  expect(r.adopted).toHaveLength(3);
  expect(existsSync(path.join(dir, "sam3_decoder.onnx"))).toBe(true); // never deleted: the download fetches the right one
  expect(svc.modelsStatus()[0].onDisk).toBe(false);
});

test("nothing from an older install, or no ONNX runtime: nothing to do", async () => {
  expect(await moveOldFinderFiles(dataDir, { service: svc, model: MODEL })).toBeNull();
  oldFinder();
  expect(await moveOldFinderFiles(dataDir, { service: null, model: MODEL })).toBeNull();
});
