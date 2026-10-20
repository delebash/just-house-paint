// SPDX-License-Identifier: MIT
// What the engines need from this computer, said before anything downloads, and what goes wrong on an
// unusual one said in words (2026-10-20, the thirteenth review): the Visual C++ runtime, macOS 26, glibc
// 2.38; the drive's room; the slow note for every build that isn't CUDA; the memory one AI photo takes;
// an engine file an antivirus took; sd-cli's start failures; Windows' own ONNX Runtime loaded in place of
// the app's; DirectML on the adapter with the most memory.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createAiPhoto, memoryNote, unmetNeed } from "../src/aiphoto_service.js";
import { ENGINE_RELEASES, MODEL_FILES as SD_FILES, selectEngineAsset } from "../src/aiphoto/engine.js";
import { SdCliError } from "../src/aiphoto/sdcli.js";
import { bestDmlAdapter, createFinder } from "../src/finder.js";
import { sessionOptions } from "../src/segment/segmenter.js";
import { MODEL_FILES as SAM_FILES } from "../src/segment/models.js";
import { makeServer } from "./domain_helpers.js";

const dirs = [];
const scratch = () => {
  const d = mkdtempSync(path.join(os.tmpdir(), "hp-needs-"));
  dirs.push(d);
  return d;
};
let s;
afterEach(() => {
  s?.close();
  s = null;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const GiB = 1024 ** 3;
const pinned = (platform, arch, gpu) => selectEngineAsset(ENGINE_RELEASES.pinned, { platform, arch, gpu });
const sys = (o = {}) => ({ platform: "win32", arch: "x64", versions: { darwin: null, macos: null, glibc: null }, missingDlls: () => [], ...o });
// what this computer's row is (the service picks the build for the platform it runs on)
const hostRow = (gpu) => pinned(process.platform, process.arch, gpu);

/** An AI photo service on scratch folders; `engine`: install a fake engine for `gpu`'s build, with these files
 *  listed in its marker (the exe always), `present` of them on disk. */
function aiphoto({ gpu = {}, system = () => sys({ platform: process.platform, arch: process.arch }), totalMem = () => 64 * GiB, engine = null, models = false, ...rest } = {}) {
  const engineDir = scratch();
  const modelDir = scratch();
  const row = hostRow(gpu);
  if (engine && row) {
    const home = path.join(engineDir, row.tag, row.backend);
    mkdirSync(home, { recursive: true });
    writeFileSync(path.join(home, ".aiphoto-engine.json"), JSON.stringify({ files: [row.exe, ...engine.listed] }));
    for (const f of [row.exe, ...engine.present]) writeFileSync(path.join(home, f), "x");
  }
  if (models) for (const m of Object.values(SD_FILES)) writeFileSync(path.join(modelDir, m.file), "x");
  return (ctx) =>
    createAiPhoto({
      dataDir: ctx?.dataDir ?? scratch(),
      engineDir,
      modelDir,
      finder: ctx?.finder ?? { releaseGpu: async () => {} },
      stopLocalModel: async () => {},
      detectGpu: async () => gpu,
      system,
      totalMem,
      settings: { templates: () => undefined, compose: () => undefined, workingSize: () => ({ width: 320, height: 240 }) },
      ensureEngine: async () => (row ? path.join(engineDir, row.tag, row.backend, row.exe) : "sd-cli"),
      ensureModels: async () => ({ diffusion: "d", llm: "l", vae: "v" }),
      ...rest,
    });
}

describe("the AI photo says what this computer lacks, before the download", () => {
  test("the Visual C++ runtime on Windows, macOS 26, glibc 2.38 — each with what this computer has", () => {
    const win = pinned("win32", "x64", { cuda: true });
    const vc = unmetNeed(win, sys({ missingDlls: (names) => names.filter((n) => n === "VCOMP140.DLL") }));
    expect(vc).toMatchObject({ reason: "vc-runtime", missing: ["VCOMP140.DLL"], url: "https://aka.ms/vs/17/release/vc_redist.x64.exe" });
    expect(vc.detail).toBe(
      "Microsoft's Visual C++ runtime (2015–2022) isn't on this computer (VCOMP140.DLL missing) — install it from https://aka.ms/vs/17/release/vc_redist.x64.exe, then try again",
    );
    expect(unmetNeed(win, sys())).toBeNull();
    const mac = pinned("darwin", "arm64", {});
    const old = unmetNeed(mac, sys({ platform: "darwin", arch: "arm64", versions: { macos: "15.6.1" } }));
    expect(old).toMatchObject({ reason: "macos", need: "26.0", have: "15.6.1", detail: "the AI photo's engine needs macOS 26.0 or later; this Mac has macOS 15.6.1" });
    expect(unmetNeed(mac, sys({ platform: "darwin", arch: "arm64", versions: { macos: "26.0.1" } }))).toBeNull();
    const linux = pinned("linux", "x64", { vulkan: true });
    expect(unmetNeed(linux, sys({ platform: "linux", versions: { glibc: "2.35" } }))).toMatchObject({ reason: "glibc", need: "2.38", have: "2.35" });
    expect(unmetNeed(linux, sys({ platform: "linux", versions: { glibc: null } })).detail).toMatch(/this one has no glibc$/); // musl
    expect(unmetNeed(linux, sys({ platform: "linux", versions: { glibc: "2.39" } }))).toBeNull();
    expect(unmetNeed(null, sys({ platform: "darwin", arch: "x64" }))).toMatchObject({ reason: "no-build" });
  });

  test("not met: the status says available false with the reason, and Install refuses — nothing downloads", async () => {
    let downloads = 0;
    // whichever this computer's build needs, it lacks: a DLL missing, an old macOS, an old glibc
    const lacking = () => sys({ platform: process.platform, arch: process.arch, versions: { macos: "15.0", glibc: "2.35" }, missingDlls: (names) => names.slice(-1) });
    s = makeServer({ aiphoto: aiphoto({ system: lacking, ensureEngine: async () => downloads++, ensureModels: async () => downloads++ }) });
    const st = await (await s.app.request("/v1/aiphoto/status")).json();
    expect(st.available).toBe(false);
    expect(["vc-runtime", "macos", "glibc", "no-build"]).toContain(st.need.reason);
    const r = await s.app.request("/v1/aiphoto/install", { method: "POST" });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ title: "The AI photo can't run on this computer", detail: st.need.detail });
    expect(downloads).toBe(0);
  });

  test("an install that won't fit the drive is refused in words naming the sizes", async () => {
    s = makeServer({ aiphoto: aiphoto() });
    s.ctx.freeBytes = async () => 2e9;
    const f = await s.app.request("/v1/segment/install", { method: "POST" });
    expect(f.status).toBe(507);
    expect(await f.json()).toMatchObject({
      title: "Not enough room on the drive",
      detail: "The part finder needs 3.6 GB on the drive of the app's data folder; it has 2.0 GB free — make room, or move the data folder to a bigger drive",
    });
    const st = await (await s.app.request("/v1/aiphoto/status")).json();
    if (st.available) {
      // the downloads and the engine's zips unpacked beside them
      expect(st.diskBytes).toBeGreaterThan(st.downloadBytes);
      const a = await s.app.request("/v1/aiphoto/install", { method: "POST" });
      expect(a.status).toBe(507);
      expect((await a.json()).detail).toMatch(/^The AI photo needs \d+\.\d GB on the drive of the app's data folder; it has 2\.0 GB free/);
    }
    // with room, it starts
    s.ctx.freeBytes = async () => 50e9;
    expect((await s.app.request("/v1/segment/install", { method: "POST" })).status).toBe(202);
  });

  test("the finder's runtime not loading refuses its install too", async () => {
    s = makeServer({ aiphoto: aiphoto() });
    const real = s.ctx.finder.runtimeAnswer;
    s.ctx.finder.runtimeAnswer = { ok: false, reason: "vc-runtime", error: "Microsoft's Visual C++ runtime (2015–2022) isn't on this computer" };
    try {
      const r = await s.app.request("/v1/segment/install", { method: "POST" });
      expect(r.status).toBe(409);
      expect(await r.json()).toMatchObject({ title: "The part finder can't run on this computer", detail: expect.stringMatching(/Visual C\+\+/) });
    } finally {
      s.ctx.finder.runtimeAnswer = real;
    }
  });

  test("the slow note for every build that isn't CUDA — an integrated GPU's Vulkan build included", async () => {
    const vulkan = await aiphoto({ gpu: { runtimes: { vulkan: true } } })().status();
    if (vulkan.backend) {
      expect(vulkan.backend).not.toBe("cuda12");
      expect(vulkan.slow).toBe(true);
    }
    expect((await aiphoto({ gpu: {} })().status()).slow).toBe(true);
    if (process.platform === "win32" && process.arch === "x64") expect((await aiphoto({ gpu: { runtimes: { cuda: true } } })().status()).slow).toBe(false);
  });

  test("less memory than one AI photo takes is told before the download", async () => {
    const gpu = { runtimes: { cuda: true }, gpus: [{ vendor: "NVIDIA", vramMb: 8192 }] };
    const small = await aiphoto({ gpu, totalMem: () => 8 * GiB })().status();
    if (small.backend) expect(small.lowMemory).toMatchObject({ haveGb: 8 });
    expect((await aiphoto({ gpu, totalMem: () => 32 * GiB })().status()).lowMemory).toBeNull();
    // a card's own memory: 12 GB; the computer's own for the graphics too (the CPU build, an integrated GPU, a Mac): 16
    expect(memoryNote({ backend: "cuda12" }, gpu, 8 * GiB)).toEqual({ needGb: 12, haveGb: 8 });
    expect(memoryNote({ backend: "cuda12" }, gpu, 12 * GiB)).toBeNull();
    expect(memoryNote({ backend: "vulkan" }, { gpus: [{ vendor: "Intel", vramMb: null }], runtimes: { vulkan: true } }, 12 * GiB)).toEqual({ needGb: 16, haveGb: 12 });
    expect(memoryNote({ backend: "cpu" }, {}, 15.6 * GiB)).toBeNull(); // a 16 GB computer, a little reserved
    expect(memoryNote(null, gpu, 8 * GiB)).toBeNull();
  });
});

describe("an engine file an antivirus took, and sd-cli's start failures", () => {
  const house = { id: "h1", originalFile: "original.jpg" };
  const surfaces = [{ key: "body", hex: "#aa3322", name: "Red" }];
  const run = (service) => service.render(house, surfaces, { renderId: "r1", progress: () => {} }).catch((e) => e);

  test("the marker left behind isn't installed: the status names what's gone, the render refuses", async () => {
    const row = hostRow({});
    if (!row) return; // no build here
    const service = aiphoto({ engine: { listed: ["stable-diffusion.dll"], present: [] }, models: true })();
    const st = await service.status();
    expect(st).toMatchObject({ engineInstalled: false, engineMissing: ["stable-diffusion.dll"] });
    // Install fetches the engine again (the fake models are short, so they count too)
    const models = Object.values(SD_FILES).reduce((n, m) => n + m.size, 0);
    expect(st.downloadBytes - models).toBe(row.asset.size + (row.runtime?.size || 0));
    expect(await run(service)).toMatchObject({
      statusCode: 409,
      title: "The AI photo's engine is missing files",
      message: "stable-diffusion.dll — an antivirus may have removed them: install the AI photo again",
    });
  });

  test("Windows' exit codes in words: the Visual C++ runtime, a DLL too old, a path too long", async () => {
    if (!hostRow({})) return;
    const failing = (reason, code, missingDlls = () => []) =>
      aiphoto({
        engine: { listed: [], present: [] },
        models: true,
        system: () => sys({ platform: process.platform, arch: process.arch, missingDlls }),
        aiRepaint: async () => {
          throw new SdCliError(`sd-cli couldn't start: Windows' status (exit ${code})`, { code, reason });
        },
      })();
    const dll = await run(failing("dll-missing", 3221225781, (names) => names.slice(0, 1)));
    expect(dll).toMatchObject({ statusCode: 503, title: "The AI photo's engine couldn't start" });
    expect(dll.message).toMatch(/Visual C\+\+ runtime/);
    expect(dll.message).toMatch(/https:\/\/aka\.ms\/vs\/17\/release\/vc_redist\.x64\.exe/);
    if (hostRow({}).requires.dlls) expect(dll.slug).toBe("vc-runtime-missing");
    // the runtime here: a DLL of the engine's own, or one past what Windows says
    expect((await run(failing("dll-missing", 3221225781))).message).toMatch(/an antivirus may have removed one of its files/);
    const old = await run(failing("dll-too-old", 3221225785));
    expect(old).toMatchObject({ slug: "dll-too-old", title: "The AI photo's engine couldn't start" });
    expect(old.message).toMatch(/older than the engine needs .* install the latest Microsoft Visual C\+\+ runtime from https:\/\/aka\.ms/);
    expect((await run(failing("path-too-long", 3221225734))).message).toMatch(/move the app's data folder to a shorter path$/);
    expect((await run(failing("exe-missing", null))).message).toMatch(/files of the AI photo's engine are missing \(sd-cli/);
  });
});

describe("the part finder's runtime", () => {
  const house = { id: "h1", displayWidth: 4, displayHeight: 2 };
  function finder(o = {}) {
    const modelDir = scratch();
    for (const f of SAM_FILES) writeFileSync(path.join(modelDir, f.name), "x");
    const made = [];
    const f = createFinder({
      dataDir: scratch(),
      modelDir,
      partsConfig: () => null,
      priority: () => null,
      idleMs: () => 60_000,
      ortBinDir: "C:\\app\\node_modules\\onnxruntime-node\\bin\\napi-v6\\win32\\x64",
      missingDlls: () => [],
      loadRuntime: async () => ({}),
      modulePath: () => null,
      createSegmenter: async (opts) => {
        made.push(opts);
        return { providers: {}, dispose: async () => {} };
      },
      ...o,
    });
    return { f, made };
  }

  test("the Visual C++ runtime missing is said before anything loads, with Microsoft's download — and seen again once installed", async () => {
    let missing = ["MSVCP140_ATOMIC_WAIT.dll"];
    let loads = 0;
    const { f } = finder({ missingDlls: () => missing, loadRuntime: async () => loads++ });
    expect(await f.runtime()).toMatchObject({ ok: false, reason: "vc-runtime", missing: ["MSVCP140_ATOMIC_WAIT.dll"], url: "https://aka.ms/vs/17/release/vc_redist.x64.exe" });
    expect(loads).toBe(0);
    missing = []; // installed: no restart needed
    expect(await f.runtime()).toEqual({ ok: true });
    expect(loads).toBe(1);
  });

  test("Windows' own onnxruntime.dll loaded in place of the app's is refused in words, and a Find never runs on it", async () => {
    const where = (name) => (name === "onnxruntime.dll" ? "C:\\WINDOWS\\SYSTEM32\\onnxruntime.dll" : "C:\\app\\resources\\app.asar.unpacked\\node_modules\\onnxruntime-node\\bin\\napi-v6\\win32\\x64\\onnxruntime_binding.node");
    const { f, made } = finder({ modulePath: where });
    const r = await f.runtime();
    expect(r).toMatchObject({ ok: false, reason: "files-missing", files: ["onnxruntime.dll"] });
    expect(r.error).toMatch(/^the app's own onnxruntime\.dll is missing, and another copy \(C:\\WINDOWS\\SYSTEM32\\onnxruntime\.dll\) loaded in its place.* an antivirus may have quarantined it/);
    await expect(f.find(house, { progress: () => {} })).rejects.toMatchObject({ statusCode: 503, slug: "runtime-missing", title: "The part finder can't run on this computer" });
    expect(made).toEqual([]); // no model was loaded on it
    // the app's own, beside its binding (any case): fine
    const same = (name) => `C:\\App\\bin\\${name}`;
    expect(await finder({ modulePath: (n) => same(n).toLowerCase() }).f.runtime()).toEqual({ ok: true });
  });

  test("the app's onnxruntime.dll gone and nothing loaded: named", async () => {
    const { f } = finder({
      ortBinDir: scratch(), // no onnxruntime.dll in it
      loadRuntime: async () => {
        throw new Error("The specified module could not be found.\r\n\\\\?\\C:\\app\\onnxruntime_binding.node");
      },
    });
    expect(await f.runtime()).toMatchObject({ ok: false, reason: "files-missing", files: ["onnxruntime.dll"] });
  });

  test("DirectML takes the adapter with the most memory of its own, not adapter 0", async () => {
    const laptop = [
      { index: 0, name: "Intel(R) Iris(R) Xe Graphics", dedicatedMb: 128, software: false },
      { index: 1, name: "NVIDIA GeForce RTX 3060 Laptop GPU", dedicatedMb: 5996, software: false },
      { index: 2, name: "Microsoft Basic Render Driver", dedicatedMb: 0, software: true },
    ];
    expect(bestDmlAdapter(laptop)).toBe(1);
    expect(bestDmlAdapter([laptop[2]])).toBeUndefined(); // the software adapter never
    expect(bestDmlAdapter([])).toBeUndefined();
    expect(bestDmlAdapter([{ index: 0, dedicatedMb: 4096 }, { index: 1, dedicatedMb: 4096 }])).toBe(0); // a tie keeps the earlier
    expect(sessionOptions("dml", { dmlDeviceId: 1 }).executionProviders).toEqual([{ name: "dml", deviceId: 1 }]);
    expect(sessionOptions("dml").executionProviders).toEqual(["dml"]); // DirectML's own default
    expect(sessionOptions("cpu", { dmlDeviceId: 1 }).executionProviders).toEqual(["cpu"]);
    // the finder hands its pick to the segmenter
    const { f, made } = finder({ dmlDeviceId: () => bestDmlAdapter(laptop) });
    await f.releaseGpu();
    await f.box(house, { x0: 0, y0: 0, x1: 1, y1: 1 }).catch(() => {});
    expect(made[0]).toMatchObject({ dmlDeviceId: 1 });
  });
});
