// SPDX-License-Identifier: MIT
// The part finder (finder.js) and the AI photo's routes: overlaps resolved by priority, the encoded photo reused for
// boxes, SAM 3's adapter for the kit; the AI photo of a house (a job — with a fake image feature). The engines and
// models are the kit's — its ONNX and sd.cpp runtimes hold, book and refuse them, tested there; the real ones gated in
// tests/segment and tests/aiphoto.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApiError } from "@delebash/core/platform/errors";
import { afterEach, describe, expect, test } from "vitest";
import { createAiPhoto, sharedGpuNote, surfaceWords } from "../src/aiphoto_service.js";
import { createFinder, resolveOverlaps, sam3Adapter } from "../src/finder.js";
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
    let encoded = 0;
    return {
      calls,
      factory: async () => ({
        providers: { image: "cpu" },
        async encode(file) {
          calls.push(["encode", path.basename(file)]);
          return { id: ++encoded, width: 4, height: 2 };
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
        release(h) {
          calls.push(["release", h.id]);
        },
        async dispose() {
          calls.push(["dispose"]);
        },
      }),
    };
  }
  const house = { id: "h1", displayWidth: 4, displayHeight: 2 };

  /** The finder on a stand-in for the kit's runVisionFeature: SAM 3's adapter builds one instance, which every run
   *  gets (the kit's withModel holds it); `refuse` an error the kit answers instead. */
  function finderWith(seg, { refuse = null } = {}) {
    let instance = null;
    const run = async (fn) => {
      if (refuse) throw refuse;
      instance ??= await sam3Adapter({ createSegmenter: seg.factory }).create({ files: {}, ort: {}, executionProvider: "cpu" });
      return fn(instance);
    };
    const config = [
      { key: "body", labelKey: "parts.body", prompts: ["house"], paintable: true, group: "walls", method: "subtract" },
      { key: "frontDoor", labelKey: "parts.frontDoor", prompts: ["door"], paintable: true, group: "doors" },
      { key: "garageDoor", labelKey: "parts.garageDoor", prompts: ["garage door"], paintable: true, group: "doors" },
      { key: "roof", labelKey: "parts.roof", prompts: ["roof"], paintable: false, group: "roof" },
    ];
    return createFinder({
      dataDir: scratch(),
      run,
      partsConfig: () => config,
      priority: () => ["garageDoor", "frontDoor", "body"],
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
  });

  test("the last two houses' photos stay encoded, for their next box; an older one is let go", async () => {
    const seg = fakeSegmenter();
    const f = finderWith(seg);
    for (const h of ["h1", "h2", "h1", "h3", "h1", "h2"]) await f.box({ ...house, id: h }, { x0: 0, y0: 0, x1: 2, y1: 2 });
    // h1 and h2 encoded once each; h3 pushed h1 out (the oldest), and h2 out after h1 came back
    expect(seg.calls.filter((c) => c[0] === "encode")).toHaveLength(5);
    expect(seg.calls.filter((c) => c[0] === "release").map((c) => c[1])).toEqual([1, 2, 3]);
  });

  test("a photo in use is never let go under its run: a find on one house while boxes run on two others", async () => {
    const seg = fakeSegmenter();
    let open;
    const gate = new Promise((r) => (open = r));
    const made = seg.factory;
    // house h1's find waits at its first prompt until the boxes on h2 and h3 are done
    seg.factory = async (...a) => {
      const s = await made(...a);
      const findText = s.findText;
      return { ...s, findText: async (h, phrase) => (h.id === 1 && (await gate), findText(h, phrase)) };
    };
    const f = finderWith(seg);
    const finding = f.find(house, { signal: new AbortController().signal, progress: () => {} });
    await new Promise((r) => setTimeout(r, 5));
    await f.box({ ...house, id: "h2" }, { x0: 0, y0: 0, x1: 2, y1: 2 });
    await f.box({ ...house, id: "h3" }, { x0: 0, y0: 0, x1: 2, y1: 2 });
    // three houses' photos, one in use: the oldest not in use (h2's) went, never h1's
    expect(seg.calls.filter((c) => c[0] === "release").map((c) => c[1])).toEqual([2]);
    open();
    expect((await finding).map((p) => p.key)).toEqual(["body", "frontDoor", "garageDoor"]);
    // a second run on a house being encoded waits for that encode — one encode each
    await Promise.all([f.box({ ...house, id: "h4" }, { x0: 0, y0: 0, x1: 2, y1: 2 }), f.box({ ...house, id: "h4" }, { x0: 0, y0: 0, x1: 2, y1: 2 })]);
    expect(seg.calls.filter((c) => c[0] === "encode")).toHaveLength(4);
  });

  test("the kit's refusal is the finder's: not downloaded, the card busy", async () => {
    const notHere = new ApiError(409, "model-not-downloaded", "The vision model isn't downloaded", "sam3");
    await expect(finderWith(fakeSegmenter(), { refuse: notHere }).find(house, { progress: () => {} })).rejects.toBe(notHere);
    const busy = new ApiError(409, "gpu-busy", "The graphics card is busy", "stable-diffusion.cpp is working");
    await expect(finderWith(fakeSegmenter(), { refuse: busy }).box(house, { x0: 0, y0: 0, x1: 2, y1: 2 })).rejects.toBe(busy);
  });

  test("SAM 3's adapter builds the segmenter from what the kit hands it", async () => {
    const seen = [];
    const seg = await sam3Adapter({ createSegmenter: async (o) => (seen.push(o), { dispose: async () => {} }) }).create({
      files: { image: "i.onnx" },
      ort: { InferenceSession: {} },
      executionProvider: "auto",
      dmlDeviceId: 1,
      log: null,
    });
    expect(seen).toEqual([{ files: { image: "i.onnx" }, ort: { InferenceSession: {} }, executionProvider: "auto", dmlDeviceId: 1, log: null }]);
    expect(seg.encodings).toBeInstanceOf(Map);
  });
});

describe("the engine routes", () => {
  // the AI photo's service on a fake image feature: `ready` what the kit's readiness answers
  function aiphotoFactory(calls, { ready = true } = {}) {
    return (ctx) =>
      createAiPhoto({
        dataDir: ctx.dataDir,
        settings: { templates: () => undefined, compose: () => undefined, workingSize: () => ({ width: 320, height: 240 }) },
        readiness: () =>
          ready
            ? { feature: "aiphoto.render", ready: true, need: "", runtime: "sdcpp", model: "flux2-klein-4b" }
            : { feature: "aiphoto.render", ready: false, need: "model-not-downloaded", runtime: "sdcpp", model: "flux2-klein-4b", modelState: { name: "FLUX.2 [klein] 4B" } },
        aiRepaint: async (args) => {
          calls.push(["aiRepaint", args.surfaces.map((x) => [x.surfaceLabel, x.colorHex, x.currentHex])]);
          expect(args.generate).toBeTypeOf("function"); // the kit's image feature draws
          args.onProgress({ fraction: 0.5, stage: "generate" });
          writeFileSync(args.outPath, "png");
          // each surface's ΔE, in the order they were given; the worst is the trim
          return { deltaE: 0.3, surfaces: args.surfaces.map((_, i) => ({ deltaE: i === 1 ? 0.3 : 0.1 })) };
        },
      });
  }

  test("not ready (the kit's readiness): the AI photo's job ends saying what to install — nothing drawn", async () => {
    const calls = [];
    s = makeServer({ aiphoto: aiphotoFactory(calls, { ready: false }) });
    const house = await (await s.upload(await jpeg(200, 150))).json();
    await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
    const form = new FormData();
    form.append("file", new Blob(["code,name,hex\nX-1,Brick Red,#a33a2f"]), "p.csv");
    form.append("brand", "behr");
    await s.app.request("/v1/paints/import", { method: "POST", body: form });
    const job = await (await s.json("POST", `/v1/houses/${house.id}/aiphoto`, { colors: { body: "behr:X-1" } })).json();
    const done = await s.settle(job.id);
    expect(done.state).toBe("error");
    expect(done.error).toMatchObject({ status: 409 });
    expect(JSON.stringify(done.error)).toMatch(/download its model first \(FLUX\.2 \[klein\] 4B\)/);
    expect(calls).toEqual([]);
  });

  test("a design deleted while its AI photo is drawn: the AI photo is kept, without the link; a second one joins it", async () => {
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
    // a second AI photo of this house is the running one (another house's waits for the card: the kit's sd.cpp
    // runtime refuses while it works — tested in the kit)
    const again = await s.json("POST", `/v1/houses/${house.id}/aiphoto`, { designId: design.id });
    expect(again.status).toBe(202);
    expect((await again.json()).id).toBe(job.id);
    expect((await s.app.request(`/v1/designs/${design.id}`, { method: "DELETE" })).status).toBe(204);
    while (!release) await new Promise((r) => setTimeout(r, 5));
    release();
    const done = await s.settle(job.id);
    expect(done.state).toBe("done");
    expect(done.result.designId).toBeNull();
    expect((await (await s.app.request(`/v1/houses/${house.id}/renders`)).json()).map((r) => r.id)).toEqual([done.result.id]);
  });

  test("the engines' routes are the kit's /v1/ai/runtimes: the part finder's and the AI photo's own are gone", async () => {
    s = makeServer({ aiphoto: aiphotoFactory([]) });
    for (const url of ["/v1/segment/status", "/v1/segment/runtime", "/v1/aiphoto/status"]) expect((await s.app.request(url)).status).toBe(404);
    expect((await s.app.request("/v1/segment/install", { method: "POST" })).status).toBe(404);
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

  test("the AI photo paints the design's paintable parts, and is kept", async () => {
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
    // the part furthest off is named with its ΔE (2026-10-28: "ΔE 37.8" alone hid that the model had left the
    // porch door as photographed)
    expect(done.result).toMatchObject({ houseId: house.id, deltaE: 0.3, worstPart: "trim", sharedGpu: null });
    // the roof isn't paintable, so only body and trim go to the model, in English words
    expect(calls.find((c) => c[0] === "aiRepaint")[1]).toEqual([
      ["body", "#a33a2f", "#f4f4f2"],
      ["trim", "#f4f4f2", null],
    ]);
    const renders = await (await s.app.request(`/v1/houses/${house.id}/renders`)).json();
    expect(renders).toHaveLength(1);
    expect(renders[0]).toMatchObject({ deltaE: 0.3, worstPart: "trim" }); // kept with the AI photo
    expect((await s.app.request(`/v1/renders/${renders[0].id}/image`)).headers.get("content-type")).toBe("image/png");
    // a row naming a file the app never makes (an older backup's — the twentieth review: a 500 that couldn't be
    // removed): no picture, and the row still goes
    s.db.run("UPDATE renders SET file = ? WHERE id = ?", ["../../outside.png", renders[0].id]);
    expect((await s.app.request(`/v1/renders/${renders[0].id}/image`)).status).toBe(404);
    expect((await s.app.request(`/v1/renders/${renders[0].id}`, { method: "DELETE" })).status).toBe(204);
    expect(await (await s.app.request(`/v1/houses/${house.id}/renders`)).json()).toEqual([]);
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
