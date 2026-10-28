// SPDX-License-Identifier: MIT
// An older install's AI photo files moved into the kit's cache at start-up (aiphoto/migrate.js — the kit's engines
// plan, H4: nobody downloads twice): the model's files adopted by the kit's runtime (vouched for by the old manifest,
// else hashed), the old engine build moved untouched into the kit's sd.cpp folder (the kit's install sweeps it), the
// emptied folders gone. On the kit's real RuntimeService over a temp cache, with a small model row of the same shape.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { binaryAsset, DEFAULT_SDCPP_BINARIES, DEFAULT_SDCPP_BUILD } from "@delebash/core/runner/config";
import { RuntimeService } from "@delebash/core/runner/runtime_service";
import { afterEach, beforeEach, expect, test } from "vitest";
import { moveOldAiPhotoFiles, oldEngineDir, oldModelDir } from "../../src/aiphoto/migrate.js";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const BODIES = { diffusion_model: Buffer.from("diffusion weights"), llm: Buffer.from("text encoder"), vae: Buffer.from("vae") };
const OLD = { diffusion_model: "flux-2-klein-4b-Q8_0.gguf", llm: "Qwen3-4B-Q8_0.gguf", vae: "flux2-klein-vae.safetensors" };
const MODEL = {
  runtime: "sdcpp",
  id: "flux2-klein-4b",
  name: "FLUX.2 [klein] 4B",
  files: Object.entries(BODIES).map(([slot, body]) => ({ slot, repo: `org/${slot}`, revision: "abc123", path: `${slot}.bin`, sha256: sha(body), bytes: body.length })),
};

let dataDir;
let cache;
let svc;
beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "hp-migrate-data-"));
  cache = mkdtempSync(path.join(tmpdir(), "hp-migrate-cache-"));
  svc = new RuntimeService({
    id: "sdcpp",
    cacheRoot: cache,
    configFn: () => ({ pinnedBuild: DEFAULT_SDCPP_BUILD, binaries: DEFAULT_SDCPP_BINARIES.map(binaryAsset), idleSeconds: 0 }),
    hardwareFn: () => ({ platform: "windows", runtimes: {}, gpus: [] }),
    systemFn: () => ({ platform: "win32", arch: "x64", versions: {}, missingDlls: () => [] }),
    modelsFn: () => [MODEL],
  });
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(cache, { recursive: true, force: true });
});

/** The older install's model folder: the three files, and its manifest when `manifest`. */
function oldModel({ manifest = true } = {}) {
  const dir = oldModelDir(dataDir);
  mkdirSync(dir, { recursive: true });
  const m = {};
  for (const f of MODEL.files) {
    const p = path.join(dir, OLD[f.slot]);
    writeFileSync(p, BODIES[f.slot]);
    const st = statSync(p);
    m[OLD[f.slot]] = { sha256: f.sha256, size: st.size, mtimeMs: st.mtimeMs };
  }
  if (manifest) writeFileSync(path.join(dir, ".aiphoto-models.json"), JSON.stringify(m));
  return dir;
}

test("the model's files move into the kit's cache — vouched for by the old manifest; the old folder goes", async () => {
  const dir = oldModel();
  const r = await moveOldAiPhotoFiles(dataDir, { service: svc, model: MODEL });
  expect(r.models).toEqual({ adopted: MODEL.files.map((f) => f.sha256), kept: [], skipped: [] });
  expect(existsSync(dir)).toBe(false); // the files moved, the manifest and the folder gone
  expect(svc.modelsStatus()[0].onDisk).toBe(true);
  expect(readFileSync(svc.modelFor(MODEL.id).files.vae).equals(BODIES.vae)).toBe(true);
  // a second start finds nothing to move
  expect(await moveOldAiPhotoFiles(dataDir, { service: svc, model: MODEL })).toEqual({ models: null, engine: [] });
});

test("without the manifest each file is checked against its pin first; one that isn't what it says stays", async () => {
  const dir = oldModel({ manifest: false });
  writeFileSync(path.join(dir, OLD.llm), "text encodeR"); // the right size, the wrong bytes
  const r = await moveOldAiPhotoFiles(dataDir, { service: svc, model: MODEL });
  expect(r.models.adopted).toEqual([MODEL.files[0].sha256, MODEL.files[2].sha256]);
  expect(r.models.skipped).toEqual([{ sha256: MODEL.files[1].sha256, reason: "checksum" }]);
  expect(existsSync(path.join(dir, OLD.llm))).toBe(true); // never deleted: the download fetches the right one
  expect(svc.modelsStatus()[0].onDisk).toBe(false);
});

test("the old engine build moves untouched into the kit's sd.cpp folder (its install sweeps it); data/engines goes", async () => {
  const old = path.join(oldEngineDir(dataDir), "master-973-f0aac52", "cuda12");
  mkdirSync(old, { recursive: true });
  writeFileSync(path.join(old, "sd-cli.exe"), "an older build");
  mkdirSync(path.join(oldEngineDir(dataDir), ".downloads"), { recursive: true });
  writeFileSync(path.join(oldEngineDir(dataDir), ".downloads", "cudart-sd-bin-win-cu12-x64.zip.part"), "part");
  const r = await moveOldAiPhotoFiles(dataDir, { service: svc, model: MODEL });
  expect(r.engine.sort()).toEqual([".downloads", "master-973-f0aac52"]);
  expect(readFileSync(path.join(svc.root, "master-973-f0aac52", "cuda12", "sd-cli.exe"), "utf8")).toBe("an older build");
  expect(existsSync(path.join(dataDir, "engines"))).toBe(false);
  // a build of that name the kit already holds is never overwritten
  mkdirSync(path.join(oldEngineDir(dataDir), DEFAULT_SDCPP_BUILD), { recursive: true });
  mkdirSync(path.join(svc.root, DEFAULT_SDCPP_BUILD), { recursive: true });
  expect((await moveOldAiPhotoFiles(dataDir, { service: svc, model: MODEL })).engine).toEqual([]);
  expect(existsSync(path.join(oldEngineDir(dataDir), DEFAULT_SDCPP_BUILD))).toBe(true);
});

test("nothing from an older install, or no sd.cpp runtime: nothing to do", async () => {
  expect(await moveOldAiPhotoFiles(dataDir, { service: svc, model: MODEL })).toEqual({ models: null, engine: [] });
  expect(await moveOldAiPhotoFiles(dataDir, { service: null, model: MODEL })).toEqual({ models: null, engine: [] });
});
