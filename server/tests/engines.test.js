// SPDX-License-Identifier: MIT
// The part finder's adapter (finder.js) and the engine routes: overlaps resolved by priority, the
// encoded photo reused for boxes, the GPU released; installing (jobs); the AI photo of a house
// (a job — with fake engines; the real ones are tested gated in tests/segment and tests/aiphoto).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createAiPhoto, surfaceWords } from "../src/aiphoto_service.js";
import { MODEL_FILES as SD_FILES } from "../src/aiphoto/engine.js";
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

  test("not installed: a 409 that says to download the model", async () => {
    const f = finderWith(fakeSegmenter(), { installed: false });
    await expect(f.find(house, { progress: () => {} })).rejects.toMatchObject({ statusCode: 409, slug: "models-missing" });
  });
});

describe("the engine routes", () => {
  function aiphotoFactory(calls) {
    return (ctx) => {
      const engineDir = scratch();
      const modelDir = scratch();
      mkdirSync(path.join(engineDir, "master-973", "cuda12"), { recursive: true });
      writeFileSync(path.join(engineDir, "master-973", "cuda12", ".aiphoto-engine.json"), "{}");
      for (const m of Object.values(SD_FILES)) writeFileSync(path.join(modelDir, m.file), "x");
      return createAiPhoto({
        dataDir: ctx.dataDir,
        engineDir,
        modelDir,
        finder: ctx.finder,
        stopLocalModel: async () => calls.push("stopLocalModel"),
        detectGpu: async () => ({ gpus: [{ vendor: "nvidia", vram_mb: 8192 }] }),
        settings: { templates: () => undefined, compose: () => undefined, workingSize: () => ({ width: 320, height: 240 }) },
        ensureEngine: async () => "C:/engine/sd-cli.exe",
        ensureModels: async () => ({ diffusion: "d", llm: "l", vae: "v" }),
        aiRepaint: async (args) => {
          calls.push(["aiRepaint", args.surfaces.map((x) => [x.surfaceLabel, x.colorHex])]);
          args.onProgress({ fraction: 0.5, stage: "generate" });
          writeFileSync(args.outPath, "png");
          return { deltaE: 0.3 };
        },
      });
    };
  }

  test("status and install of both engines", async () => {
    s = makeServer({ aiphoto: aiphotoFactory([]) });
    expect(await (await s.app.request("/v1/segment/status")).json()).toEqual({ installed: true, downloadBytes: 3_364_167_120 });
    const job = await (await s.json("POST", "/v1/segment/install")).json();
    expect((await s.settle(job.id)).state).toBe("done");
    const st = await (await s.app.request("/v1/aiphoto/status")).json();
    expect(st).toMatchObject({ engineInstalled: true, modelsInstalled: true });
    expect(st.downloadBytes).toBeGreaterThan(8e9);
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
    const r = await s.json("POST", `/v1/houses/${house.id}/aiphoto`, { colors: { body: "behr:X-1", trim: "behr:X-2", roof: "behr:X-2" } });
    expect(r.status).toBe(202);
    const done = await s.settle((await r.json()).id);
    expect(done.state).toBe("done");
    expect(done.result).toMatchObject({ houseId: house.id, deltaE: 0.3 });
    // the roof isn't paintable, so only body and trim go to the model, in English words
    expect(calls.find((c) => c[0] === "aiRepaint")[1]).toEqual([
      ["body", "#a33a2f"],
      ["trim", "#f4f4f2"],
    ]);
    expect(calls).toContain("stopLocalModel");
    expect(fakeFinder.calls.some((c) => c[0] === "releaseGpu")).toBe(true);
    const renders = await (await s.app.request(`/v1/houses/${house.id}/renders`)).json();
    expect(renders).toHaveLength(1);
    expect((await s.app.request(`/v1/renders/${renders[0].id}/image`)).headers.get("content-type")).toBe("image/png");
    expect((await s.app.request(`/v1/renders/${renders[0].id}`, { method: "DELETE" })).status).toBe(204);
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
