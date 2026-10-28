// SPDX-License-Identifier: MIT
// What the part finder needs from this computer, said before anything downloads, and what goes wrong on an unusual
// one said in words (2026-10-20, the thirteenth review): the drive's room; its runtime — the Visual C++ runtime,
// Windows' own ONNX Runtime loaded in place of the app's; DirectML on the adapter with the most memory. The AI
// photo's are the kit's now (its engine and model are the kit's sd.cpp runtime: the kit's runtime_service,
// disk_room and runtime-model tests — the engines plan, round B).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
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

// the AI photo isn't what these tests are about: one that can always run
const anyAiphoto = () => () => ({ readiness: () => ({ ready: true }), render: async () => ({ file: "x.png", deltaE: 0, seconds: 0, engine: "" }) });

describe("the part finder's install: the drive's room, its runtime", () => {
  test("an install that won't fit the drive is refused in words naming the sizes", async () => {
    s = makeServer({ aiphoto: anyAiphoto() });
    s.ctx.freeBytes = async () => 2e9;
    const f = await s.app.request("/v1/segment/install", { method: "POST" });
    expect(f.status).toBe(507);
    expect(await f.json()).toMatchObject({
      title: "Not enough room on the drive",
      detail: "The part finder needs 3.6 GB on the drive of the app's data folder; it has 2.0 GB free — make room, or move the data folder to a bigger drive",
    });
    // with room, it starts
    s.ctx.freeBytes = async () => 50e9;
    expect((await s.app.request("/v1/segment/install", { method: "POST" })).status).toBe(202);
  });

  test("a resumed install counts what its unfinished downloads already hold — never refused for room it has", async () => {
    // the kit preallocates each `<file>.part` at its full size and keeps it for resume (the fourteenth review: 507)
    s = makeServer({ aiphoto: anyAiphoto() });
    const { finderModelDir } = await import("../src/services.js");
    s.ctx.finder = { ...s.ctx.finder, downloadBytes: () => 3e6 };
    const margin = 256 * 1024 * 1024;
    s.ctx.freeBytes = async () => margin + 1.5e6;
    expect((await s.app.request("/v1/segment/install", { method: "POST" })).status).toBe(507);
    mkdirSync(finderModelDir(s.dataDir), { recursive: true });
    writeFileSync(path.join(finderModelDir(s.dataDir), "sam3_image_encoder.onnx.part"), Buffer.alloc(2e6));
    expect((await s.app.request("/v1/segment/install", { method: "POST" })).status).toBe(202);
  });

  test("the finder's runtime not loading refuses its install too", async () => {
    s = makeServer({ aiphoto: anyAiphoto() });
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
