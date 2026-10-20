// SPDX-License-Identifier: MIT
// The part finder's adapter (finder.js) and the engine routes: overlaps resolved by priority, the
// encoded photo reused for boxes, the GPU released; installing (jobs); the AI photo of a house
// (a job — with fake engines; the real ones are tested gated in tests/segment and tests/aiphoto).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createAiPhoto, sharedGpuNote, surfaceWords } from "../src/aiphoto_service.js";
import { ENGINE_RELEASES, MODEL_FILES as SD_FILES, selectEngineAsset } from "../src/aiphoto/engine.js";
import { createFinder, resolveOverlaps } from "../src/finder.js";
import { MODEL_FILES as SAM_FILES } from "../src/segment/models.js";
import { fakeFinder, jpeg, makeServer } from "./domain_helpers.js";

const dirs = [];
const scratch = () => {
  const d = mkdtempSync(path.join(os.tmpdir(), "hp-engines-"));
  dirs.push(d);
  return d;
};
let s;
afterEach(() => {
  s?.close();
  s = null;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  fakeFinder.calls.length = 0;
});

const mask = (n, set) => Uint8Array.from({ length: n }, (_, i) => (set(i) ? 255 : 0));

describe("resolveOverlaps", () => {
  test("a pixel goes to the earlier part of the priority list", () => {
    const parts = [
      { key: "body", mask: mask(10, () => true) },
      { key: "frontDoor", mask: mask(10, (i) => i >= 4) }, // "door" also takes the garage door
      { key: "garageDoor", mask: mask(10, (i) => i >= 7) },
      { key: "roof", mask: null },
    ];
    const out = resolveOverlaps(parts, ["garageDoor", "frontDoor", "body"]);
    expect(out.map((p) => [p.key, p.area ?? null])).toEqual([
      ["body", 4],
      ["frontDoor", 3],
      ["garageDoor", 3],
      ["roof", null],
    ]);
  });
});

describe("createFinder", () => {
  function fakeSegmenter() {
    const calls = [];
    return {
      calls,
      factory: async () => ({
        providers: { image: "cpu" },
        async encode(file) {
          calls.push(["encode", path.basename(file)]);
          return { id: 1, width: 4, height: 2 };
        },
        async findText(h, phrase) {
          calls.push(["text", phrase]);
          const m = phrase === "house" ? mask(8, () => true) : phrase === "door" ? mask(8, (i) => i >= 4) : phrase === "garage door" ? mask(8, (i) => i >= 6) : null;
          return m ? [{ score: 0.9, mask: m, area: m.filter(Boolean).length, box: [0, 0, 4, 2] }] : [];
        },
        async findBoxes(h, boxes) {
          calls.push(["box", boxes[0]]);
          return [{ score: 0.8, mask: mask(8, (i) => i === 1) }];
        },
        release() {},
        async dispose() {
          calls.push(["dispose"]);
        },
      }),
    };
  }
  const house = { id: "h1", displayWidth: 4, displayHeight: 2 };

  function finderWith(seg, { installed = true } = {}) {
    const modelDir = scratch();
    if (installed) for (const f of SAM_FILES) writeFileSync(path.join(modelDir, f.name), "x");
    const config = [
      { key: "body", labelKey: "parts.body", prompts: ["house"], paintable: true, group: "walls", method: "subtract" },
      { key: "frontDoor", labelKey: "parts.frontDoor", prompts: ["door"], paintable: true, group: "doors" },
      { key: "garageDoor", labelKey: "parts.garageDoor", prompts: ["garage door"], paintable: true, group: "doors" },
      { key: "roof", labelKey: "parts.roof", prompts: ["roof"], paintable: false, group: "roof" },
    ];
    return createFinder({
      dataDir: scratch(),
      modelDir,
      createSegmenter: seg.factory,
      // the runtime loads, and is the app's (engine_needs.test.js checks the refusals)
      loadRuntime: async () => ({}),
      missingDlls: () => [],
      modulePath: () => null,
      partsConfig: () => config,
      priority: () => ["garageDoor", "frontDoor", "body"],
      idleMs: () => 60_000,
    });
  }

  test("finds the parts once per photo, each pixel in one part, and reuses the encode for a box", async () => {
    const seg = fakeSegmenter();
    const f = finderWith(seg);
    const steps = [];
    const parts = await f.find(house, { signal: new AbortController().signal, progress: (p, m) => steps.push(m) });
    // the body is "house" minus the other parts; "door" also covered the garage door, which wins
    // its pixels (earlier in the priority list); the roof found nothing and is left out
    expect(parts.map((p) => [p.key, p.mask.filter(Boolean).length])).toEqual([
      ["body", 4],
      ["frontDoor", 2],
      ["garageDoor", 2],
    ]);
    expect(steps.length).toBeGreaterThan(1);
    const region = await f.box(house, { x0: 0, y0: 0, x1: 2, y1: 2 });
    expect(Array.from(region)).toEqual([0, 255, 0, 0, 0, 0, 0, 0]);
    expect(seg.calls.filter((c) => c[0] === "encode")).toHaveLength(1);
    await f.releaseGpu();
    expect(seg.calls.at(-1)).toEqual(["dispose"]);
  });

  test("the model is let go only once the box running on it is done", async () => {
    const seg = fakeSegmenter();
    const made = seg.factory;
    let finishBox;
    seg.factory = async (...args) => ({ ...(await made(...args)), findBoxes: () => new Promise((r) => (finishBox = () => r([{ score: 0.8, mask: mask(8, (i) => i === 1) }]))) });
    const f = finderWith(seg);
    const box = f.box(house, { x0: 0, y0: 0, x1: 2, y1: 2 });
    await vi.waitFor(() => expect(finishBox).toBeTypeOf("function"));
    let released = false;
    const release = f.releaseGpu().then(() => (released = true));
    await new Promise((r) => setTimeout(r, 30));
    expect(released).toBe(false); // the idle release, a removal, the AI photo: all wait for the box
    expect(seg.calls).not.toContainEqual(["dispose"]);
    finishBox();
    expect(Array.from(await box)).toEqual([0, 255, 0, 0, 0, 0, 0, 0]);
    await release;
    expect(seg.calls.at(-1)).toEqual(["dispose"]);
  });

  test("not installed: a 409 that says to download the model", async () => {
    const f = finderWith(fakeSegmenter(), { installed: false });
    await expect(f.find(house, { progress: () => {} })).rejects.toMatchObject({ statusCode: 409, slug: "models-missing" });
  });
});

describe("the engine routes", () => {
  const GPU = { gpus: [{ vendor: "nvidia", vram_mb: 8192 }] };
  // installed = the pinned release, for the backend this computer's card picks
  const PINNED = selectEngineAsset(ENGINE_RELEASES.pinned, { platform: process.platform, arch: process.arch, gpu: GPU });
  function aiphotoFactory(calls, { tag = PINNED.tag } = {}) {
    return (ctx) => {
      const engineDir = scratch();
      const modelDir = scratch();
      mkdirSync(path.join(engineDir, tag, PINNED.backend), { recursive: true });
      // installed: the marker and sd-cli beside it (the engine's files are checked, not the marker alone)
      writeFileSync(path.join(engineDir, tag, PINNED.backend, ".aiphoto-engine.json"), JSON.stringify({ files: [PINNED.exe] }));
      writeFileSync(path.join(engineDir, tag, PINNED.backend, PINNED.exe), "exe");
      for (const m of Object.values(SD_FILES)) writeFileSync(path.join(modelDir, m.file), "x");
      return createAiPhoto({
        dataDir: ctx.dataDir,
        engineDir,
        modelDir,
        finder: ctx.finder,
        stopLocalModel: async () => calls.push("stopLocalModel"),
        detectGpu: async () => GPU,
        settings: { templates: () => undefined, compose: () => undefined, workingSize: () => ({ width: 320, height: 240 }) },
        ensureEngine: async () => "C:/engine/sd-cli.exe",
        ensureModels: async () => ({ diffusion: "d", llm: "l", vae: "v" }),
        aiRepaint: async (args) => {
          calls.push(["aiRepaint", args.surfaces.map((x) => [x.surfaceLabel, x.colorHex, x.currentHex])]);
          args.onProgress({ fraction: 0.5, stage: "generate" });
          writeFileSync(args.outPath, "png");
          return { deltaE: 0.3 };
        },
      });
    };
  }

  test("an engine of an older release isn't the installed one: Install offers the pinned one", async () => {
    s = makeServer({ aiphoto: aiphotoFactory([], { tag: "master-1-old" }) });
    const st = await (await s.app.request("/v1/aiphoto/status")).json();
    expect(st.engineInstalled).toBe(false);
    expect(st.downloadBytes).toBeGreaterThan(0);
  });

  test("a design deleted while its AI photo is drawn: the AI photo is kept, without the link; a second one waits", async () => {
    let release;
    const calls = [];
    const factory = aiphotoFactory(calls);
    s = makeServer({
      aiphoto: (ctx) => {
        const real = factory(ctx);
        return { ...real, render: async (...a) => (await new Promise((r) => (release = r)), real.render(...a)) };
      },
    });
    const house = await (await s.upload(await jpeg(200, 150))).json();
    await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
    const form = new FormData();
    form.append("file", new Blob(["code,name,hex\nX-1,Brick Red,#a33a2f"]), "p.csv");
    form.append("brand", "behr");
    await s.app.request("/v1/paints/import", { method: "POST", body: form });
    const design = await (await s.json("POST", `/v1/houses/${house.id}/designs`, { name: "Blue", colors: { body: "behr:X-1" } })).json();
    const job = await (await s.json("POST", `/v1/houses/${house.id}/aiphoto`, { designId: design.id })).json();
    // a second AI photo, of this house or another, waits for the graphics card
    const again = await s.json("POST", `/v1/houses/${house.id}/aiphoto`, { designId: design.id });
    expect(again.status).toBe(409);
    expect((await again.json()).type).toMatch(/gpu-busy$/);
    expect((await s.app.request(`/v1/designs/${design.id}`, { method: "DELETE" })).status).toBe(204);
    while (!release) await new Promise((r) => setTimeout(r, 5));
    release();
    const done = await s.settle(job.id);
    expect(done.state).toBe("done");
    expect(done.result.designId).toBeNull();
    expect((await (await s.app.request(`/v1/houses/${house.id}/renders`)).json()).map((r) => r.id)).toEqual([done.result.id]);
  });

  test("status and install of both engines", async () => {
    s = makeServer({ aiphoto: aiphotoFactory([]) });
    expect(await (await s.app.request("/v1/segment/status")).json()).toEqual({ installed: true, downloadBytes: 3_364_167_120 });
    const job = await (await s.json("POST", "/v1/segment/install")).json();
    expect((await s.settle(job.id)).state).toBe("done");
    const st = await (await s.app.request("/v1/aiphoto/status")).json();
    expect(st).toMatchObject({ engineInstalled: true, modelsInstalled: true });
    expect(st.downloadBytes).toBeGreaterThan(8e9);
  });

  test("not installed, the finder's status says whether its runtime loads here; the start check asks it too", async () => {
    s = makeServer({ aiphoto: aiphotoFactory([]) });
    const installed = fakeFinder.installed;
    fakeFinder.installed = () => false;
    try {
      expect(await (await s.app.request("/v1/segment/status")).json()).toEqual({ installed: false, downloadBytes: 3_364_167_120, runtime: { ok: true } });
      expect((await s.app.request("/v1/segment/runtime")).status).toBe(200);
      fakeFinder.runtimeAnswer = { ok: false, error: "libonnxruntime.so.1: cannot open shared object file" };
      expect((await (await s.app.request("/v1/segment/status")).json()).runtime).toEqual(fakeFinder.runtimeAnswer);
      const r = await s.app.request("/v1/segment/runtime");
      expect(r.status).toBe(503);
      expect(await r.json()).toMatchObject({ title: "The part finder can't run on this computer", detail: expect.stringMatching(/libonnxruntime/) });
    } finally {
      fakeFinder.installed = installed;
      fakeFinder.runtimeAnswer = { ok: true };
    }
  });

  test("the finder checks its runtime once, and a failure is its first line", async () => {
    let loads = 0;
    const finder = createFinder({
      dataDir: scratch(),
      modelDir: scratch(),
      partsConfig: () => null,
      priority: () => null,
      idleMs: () => 60_000,
      loadRuntime: async () => {
        loads++;
        throw new Error("libonnxruntime.so.1: cannot open shared object file\n    at dlopen");
      },
    });
    expect(await finder.runtime()).toEqual({ ok: false, error: "libonnxruntime.so.1: cannot open shared object file" });
    await finder.runtime();
    expect(loads).toBe(1);
  });

  test("removing an engine: its files go; never while it works", async () => {
    let dirs;
    s = makeServer({
      aiphoto: (ctx) => {
        const made = aiphotoFactory([])(ctx);
        return {
          ...made,
          uninstall: async () => {
            dirs = "removed";
            await made.uninstall();
          },
        };
      },
    });
    // the part finder: the GPU let go and the model removed (the fake records it)
    fakeFinder.calls.length = 0;
    expect((await s.app.request("/v1/segment/install", { method: "DELETE" })).status).toBe(204);
    expect(fakeFinder.calls).toContainEqual(["uninstall"]);
    // the AI photo: both folders go, so the status says not installed
    expect((await s.app.request("/v1/aiphoto/install", { method: "DELETE" })).status).toBe(204);
    expect(dirs).toBe("removed");
    expect(await (await s.app.request("/v1/aiphoto/status")).json()).toMatchObject({ engineInstalled: false, modelsInstalled: false });
    // not while it works: a running job of the engine's kind refuses with a 409
    let release;
    s.ctx.jobs.start({ kind: "find-parts", key: "h" }, () => new Promise((r) => (release = r)));
    const busy = await s.app.request("/v1/segment/install", { method: "DELETE" });
    expect(busy.status).toBe(409);
    expect((await busy.json()).type).toMatch(/engine-busy$/);
    release();
  });

  test("a house restored before its first AI photo has no renders folder (a backup keeps no empty one): the AI photo works", async () => {
    s = makeServer({ aiphoto: aiphotoFactory([]) });
    const house = await (await s.upload(await jpeg(200, 150))).json();
    await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
    const form = new FormData();
    form.append("file", new Blob(["code,name,hex\nX-1,Brick Red,#a33a2f"]), "p.csv");
    form.append("brand", "behr");
    await s.app.request("/v1/paints/import", { method: "POST", body: form });
    rmSync(path.join(s.dataDir, "houses", house.id, "renders"), { recursive: true, force: true });
    const r = await s.json("POST", `/v1/houses/${house.id}/aiphoto`, { colors: { body: "behr:X-1" } });
    expect((await s.settle((await r.json()).id)).state).toBe("done");
  });

  test("while an engine is being removed, nothing installs it or runs on it", async () => {
    let finishAiphoto;
    s = makeServer({ aiphoto: (ctx) => ({ ...aiphotoFactory([])(ctx), uninstall: () => new Promise((r) => (finishAiphoto = r)) }) });
    const house = await (await s.upload(await jpeg(200, 150))).json();
    await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
    const refused = async (r, title) => {
      expect(r.status).toBe(409);
      expect(await r.json()).toMatchObject({ title });
    };
    // the part finder
    const real = fakeFinder.uninstall;
    let finishFinder;
    fakeFinder.uninstall = () => new Promise((r) => (finishFinder = r));
    try {
      const removing = s.app.request("/v1/segment/install", { method: "DELETE" });
      await vi.waitFor(() => expect(finishFinder).toBeTypeOf("function"));
      await refused(await s.app.request("/v1/segment/install", { method: "POST" }), "The part finder is being removed");
      await refused(await s.json("POST", `/v1/houses/${house.id}/find-parts`), "The part finder is being removed");
      await refused(await s.json("POST", `/v1/houses/${house.id}/parts/trim/box`, { x0: 10, y0: 10, x1: 14, y1: 14 }), "The part finder is being removed");
      finishFinder();
      expect((await removing).status).toBe(204);
    } finally {
      fakeFinder.uninstall = real;
    }
    expect((await s.json("POST", `/v1/houses/${house.id}/parts/trim/box`, { x0: 10, y0: 10, x1: 14, y1: 14 })).status).toBe(200); // done: it works again
    // the AI photo
    const removing = s.app.request("/v1/aiphoto/install", { method: "DELETE" });
    await vi.waitFor(() => expect(finishAiphoto).toBeTypeOf("function"));
    await refused(await s.app.request("/v1/aiphoto/install", { method: "POST" }), "The AI photo is being removed");
    await refused(await s.json("POST", `/v1/houses/${house.id}/aiphoto`, { colors: { body: "behr:X-1" } }), "The AI photo is being removed");
    finishAiphoto();
    expect((await removing).status).toBe(204);
  });

  test("the AI photo paints the design's paintable parts, frees the GPU first, and is kept", async () => {
    const calls = [];
    s = makeServer({ aiphoto: aiphotoFactory(calls) });
    const house = await (await s.upload(await jpeg(200, 150))).json();
    await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
    // two real paints, imported as a file
    const form = new FormData();
    form.append("file", new Blob(["code,name,hex\nX-1,Brick Red,#a33a2f\nX-2,Snow,#f4f4f2"]), "p.csv");
    form.append("brand", "behr");
    await s.app.request("/v1/paints/import", { method: "POST", body: form });
    // the body's paint now is known: it goes with the body, so the lock paints in its light
    await s.json("PUT", `/v1/houses/${house.id}/current-paints`, { body: "behr:X-2" });
    const r = await s.json("POST", `/v1/houses/${house.id}/aiphoto`, { colors: { body: "behr:X-1", trim: "behr:X-2", roof: "behr:X-2" } });
    expect(r.status).toBe(202);
    const done = await s.settle((await r.json()).id);
    expect(done.state).toBe("done");
    expect(done.result).toMatchObject({ houseId: house.id, deltaE: 0.3, sharedGpu: null });
    // the roof isn't paintable, so only body and trim go to the model, in English words
    expect(calls.find((c) => c[0] === "aiRepaint")[1]).toEqual([
      ["body", "#a33a2f", "#f4f4f2"],
      ["trim", "#f4f4f2", null],
    ]);
    expect(calls).toContain("stopLocalModel");
    expect(fakeFinder.calls.some((c) => c[0] === "releaseGpu")).toBe(true);
    const renders = await (await s.app.request(`/v1/houses/${house.id}/renders`)).json();
    expect(renders).toHaveLength(1);
    expect((await s.app.request(`/v1/renders/${renders[0].id}/image`)).headers.get("content-type")).toBe("image/png");
    expect((await s.app.request(`/v1/renders/${renders[0].id}`, { method: "DELETE" })).status).toBe(204);
  });

  test("the AI photo says what else held the graphics card while it drew", async () => {
    const held = { mb: 7066, programs: ["llama-server"] };
    s = makeServer({ aiphoto: aiphotoFactory([]), sharedGpu: async () => held });
    const house = await (await s.upload(await jpeg(200, 150))).json();
    await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
    const form = new FormData();
    form.append("file", new Blob(["code,name,hex\nX-1,Brick Red,#a33a2f"]), "p.csv");
    form.append("brand", "behr");
    await s.app.request("/v1/paints/import", { method: "POST", body: form });
    const r = await s.json("POST", `/v1/houses/${house.id}/aiphoto`, { colors: { body: "behr:X-1" } });
    const done = await s.settle((await r.json()).id);
    expect(done.state).toBe("done");
    expect(done.result.sharedGpu).toEqual(held);
  });

  test("other programs are named only above the setting, the biggest three", () => {
    const rows = [
      { label: "llama-server", memMb: 6900 },
      { label: "python · tts/serve.py", memMb: 400 },
      { label: "game", memMb: 300 },
      { label: "browser", memMb: 250 },
    ];
    expect(sharedGpuNote(rows, 1024)).toEqual({ mb: 7850, programs: ["llama-server", "python · tts/serve.py", "game"], more: 1 });
    expect(sharedGpuNote(rows.slice(1), 1024)).toBeNull(); // 950 MB: under it
    expect(sharedGpuNote(rows, 0)).toBeNull(); // the note turned off
    expect(sharedGpuNote(null, 1024)).toBeNull(); // not measurable here
    expect(sharedGpuNote([], 1024)).toBeNull();
  });

  test("nothing to paint ends the job with a clear error; an unknown design is a 404", async () => {
    s = makeServer({ aiphoto: aiphotoFactory([]) });
    const house = await (await s.upload(await jpeg(100, 80))).json();
    const job = await (await s.json("POST", `/v1/houses/${house.id}/aiphoto`, { colors: {} })).json();
    const done = await s.settle(job.id);
    expect(done.state).toBe("error");
    expect(done.error).toMatchObject({ status: 422 });
    expect((await s.json("POST", `/v1/houses/${house.id}/aiphoto`, { designId: "nope" })).status).toBe(404);
  });

  test("a part key in the model's English", () => {
    expect(surfaceWords("garageDoor")).toBe("garage door");
    expect(surfaceWords("body")).toBe("body");
  });
});
