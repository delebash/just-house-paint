// SPDX-License-Identifier: MIT
// The execution-provider plumbing, with a fake ONNX Runtime (the real models are in real.test.js).
import { describe, expect, it } from "vitest";
import { normalizeLog, openSlot, resolveProviders, runSlot, sessionOptions } from "../../src/segment/segmenter.js";

const quiet = { info: () => {}, warn: () => {} };
const recorder = () => {
  const lines = [];
  return { lines, log: { info: (m) => lines.push(["info", m]), warn: (m) => lines.push(["warn", m]) } };
};

/** A fake `ort`: `failCreate` / `failRun` list the providers that throw. */
function fakeOrt({ failCreate = [], failRun = [] } = {}) {
  const created = [];
  return {
    created,
    InferenceSession: {
      async create(file, opts) {
        const ep = opts.executionProviders[0];
        created.push({ file, ep, opts });
        if (failCreate.includes(ep)) throw new Error(`cannot create on ${ep}`);
        return {
          ep,
          released: false,
          async run(feeds) {
            if (failRun.includes(ep)) throw new Error(`cannot run on ${ep}`);
            return { ran: ep, feeds };
          },
          async release() {
            this.released = true;
          },
        };
      },
    },
  };
}

describe("resolveProviders", () => {
  it('"auto" is DirectML on Windows, the CPU elsewhere', () => {
    expect(resolveProviders("auto", "win32")).toEqual({ image: "dml", language: "dml", decoder: "dml" });
    expect(resolveProviders("auto", "linux")).toEqual({ image: "cpu", language: "cpu", decoder: "cpu" });
    expect(resolveProviders(undefined, "darwin").image).toBe("cpu");
  });

  it("takes one provider or one per model", () => {
    expect(resolveProviders("cpu", "win32").decoder).toBe("cpu");
    expect(resolveProviders({ image: "dml", language: "cpu" }, "win32")).toEqual({ image: "dml", language: "cpu", decoder: "dml" });
    expect(() => resolveProviders("cuda", "win32")).toThrow(/executionProvider/);
  });
});

describe("sessionOptions", () => {
  it("the CPU arena is off by default; DirectML gets mem patterns off + sequential", () => {
    expect(sessionOptions("cpu")).toMatchObject({ executionProviders: ["cpu"], enableCpuMemArena: false });
    expect(sessionOptions("cpu", { threads: 8, cpuMemArena: true })).toMatchObject({ intraOpNumThreads: 8, enableCpuMemArena: true });
    expect(sessionOptions("dml")).toMatchObject({ executionProviders: ["dml"], enableMemPattern: false, executionMode: "sequential" });
    expect(sessionOptions("webgpu").executionProviders).toEqual(["webgpu"]);
  });
});

describe("DirectML → CPU fallback", () => {
  it("a session that can't be created on DML is created on the CPU, logged", async () => {
    const ort = fakeOrt({ failCreate: ["dml"] });
    const { lines, log } = recorder();
    const slot = await openSlot(ort, "decoder", "d.onnx", "dml", {}, log);
    expect(slot.ep).toBe("cpu");
    expect(slot.wanted).toBe("dml");
    expect(slot.fallback).toMatch(/cannot create on dml/);
    expect(ort.created.map((c) => c.ep)).toEqual(["dml", "cpu"]);
    expect(lines[0][0]).toBe("warn");
  });

  it("a CPU failure is not swallowed", async () => {
    await expect(openSlot(fakeOrt({ failCreate: ["cpu"] }), "image", "i.onnx", "cpu", {}, quiet)).rejects.toThrow(/cannot create on cpu/);
  });

  it("a run that fails on DML swaps the slot to the CPU and runs again", async () => {
    const ort = fakeOrt({ failRun: ["dml"] });
    const { lines, log } = recorder();
    const slot = await openSlot(ort, "image", "i.onnx", "dml", {}, log);
    const old = slot.session;
    const out = await runSlot(ort, slot, { x: 1 }, {}, log);
    expect(out.ran).toBe("cpu");
    expect(old.released).toBe(true);
    expect(slot.ep).toBe("cpu");
    expect(slot.fallback).toMatch(/failed to run on dml/);
    expect(lines.some(([lvl, m]) => lvl === "warn" && /switching it to the CPU/.test(m))).toBe(true);
    expect((await runSlot(ort, slot, {}, {}, log)).ran).toBe("cpu"); // stays on the CPU
  });

  it("a run that fails on the CPU throws", async () => {
    const ort = fakeOrt({ failRun: ["cpu"] });
    const slot = await openSlot(ort, "image", "i.onnx", "cpu", {}, quiet);
    await expect(runSlot(ort, slot, {}, {}, quiet)).rejects.toThrow(/cannot run on cpu/);
  });
});

describe("createSegmenter", () => {
  it("releases the sessions that loaded when a later one fails", async () => {
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = await mkdtemp(path.join(tmpdir(), "hp-seg-"));
    // a minimal tokenizer.json the tokenizers.js constructor accepts
    await writeFile(path.join(dir, "tokenizer.json"), JSON.stringify({ model: { type: "WordLevel", vocab: { a: 0 }, unk_token: "a" }, added_tokens: [], normalizer: null, pre_tokenizer: null, post_processor: null, decoder: null }));
    await writeFile(path.join(dir, "tokenizer_config.json"), "{}");
    const sessions = [];
    const ortApi = {
      InferenceSession: {
        async create(file) {
          if (file.includes("decoder")) throw new Error("no decoder");
          const s = { released: false, release: async () => (s.released = true) };
          sessions.push(s);
          return s;
        },
      },
    };
    const { createSegmenter } = await import("../../src/segment/segmenter.js");
    await expect(createSegmenter({ modelDir: dir, executionProvider: "cpu", ortApi })).rejects.toThrow(/no decoder/);
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.released)).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
});

describe("normalizeLog", () => {
  it("takes info/warn, the kit's warning, a function, or nothing", () => {
    const seen = [];
    normalizeLog({ info: (m) => seen.push(`i:${m}`), warning: (m) => seen.push(`w:${m}`) }).warn("x");
    normalizeLog((lvl, m) => seen.push(`${lvl}:${m}`)).info("y");
    normalizeLog(null).warn("dropped");
    expect(seen).toEqual(["w:x", "info:y"]);
  });
});
