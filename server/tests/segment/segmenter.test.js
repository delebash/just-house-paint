// SPDX-License-Identifier: MIT
// SAM 3's own provider policy and its build from the kit's files and module, with a fake ONNX Runtime (the real models
// are in real.test.js; the generic session pieces — DirectML's options, the CPU fallback — are the kit's, tested there:
// runner/onnx.js, onnx_runtime.test.js).
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSegmenter, resolveProviders, SAM3_PROVIDERS } from "../../src/segment/segmenter.js";

describe("resolveProviders", () => {
  it('"auto" is DirectML on Windows, the CPU elsewhere (the kit\'s resolveProvider)', () => {
    expect(resolveProviders("auto", "win32")).toEqual({ image: "dml", language: "dml", decoder: "dml" });
    expect(resolveProviders("auto", "linux")).toEqual({ image: "cpu", language: "cpu", decoder: "cpu" });
    expect(resolveProviders(undefined, "darwin").image).toBe("cpu");
  });

  it("takes one provider or one per model", () => {
    expect(resolveProviders("cpu", "win32").decoder).toBe("cpu");
    expect(resolveProviders({ image: "dml", language: "cpu" }, "win32")).toEqual({ image: "dml", language: "cpu", decoder: "dml" });
    expect(() => resolveProviders("cuda", "win32")).toThrow(/executionProvider/);
  });

  it("the preset's auto puts only the image encoder on the card; cpu keeps all three on the processor", () => {
    expect(resolveProviders(SAM3_PROVIDERS.auto, "win32")).toEqual({ image: "dml", language: "cpu", decoder: "cpu" });
    expect(resolveProviders(SAM3_PROVIDERS.auto, "linux")).toEqual({ image: "cpu", language: "cpu", decoder: "cpu" });
    expect(resolveProviders(SAM3_PROVIDERS.cpu, "win32")).toEqual({ image: "cpu", language: "cpu", decoder: "cpu" });
  });
});

describe("createSegmenter", () => {
  const dirs = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });

  /** The model's files by slot, as the kit hands them: a minimal tokenizer the tokenizers.js constructor accepts. */
  async function files() {
    const dir = await mkdtemp(path.join(tmpdir(), "hp-seg-"));
    dirs.push(dir);
    const tokenizer = path.join(dir, "tokenizer.json");
    const tokenizerConfig = path.join(dir, "tokenizer_config.json");
    await writeFile(tokenizer, JSON.stringify({ model: { type: "WordLevel", vocab: { a: 0 }, unk_token: "a" }, added_tokens: [], normalizer: null, pre_tokenizer: null, post_processor: null, decoder: null }));
    await writeFile(tokenizerConfig, "{}");
    const at = (n) => path.join(dir, "snapshots", n);
    return { image: at("sam3_image_encoder.onnx"), language: at("sam3_language_encoder.onnx"), decoder: at("sam3_decoder.onnx"), tokenizer, tokenizer_config: tokenizerConfig };
  }

  /** A fake onnxruntime-node module: `failOn` a file name part whose session can't be created. */
  function fakeOrt({ failOn = null } = {}) {
    const sessions = [];
    return {
      sessions,
      InferenceSession: {
        async create(file, opts) {
          if (failOn && file.includes(failOn)) throw new Error(`no ${failOn}`);
          const s = { file, ep: opts.executionProviders[0], released: false, release: async () => (s.released = true) };
          sessions.push(s);
          return s;
        },
      },
    };
  }

  it("opens each model from the kit's file for its slot, on the provider the preset's choice gives it", async () => {
    const f = await files();
    const ort = fakeOrt();
    const seg = await createSegmenter({ files: f, ort, executionProvider: "cpu" });
    expect(ort.sessions.map((s) => [path.basename(s.file), s.ep])).toEqual([
      ["sam3_image_encoder.onnx", "cpu"],
      ["sam3_language_encoder.onnx", "cpu"],
      ["sam3_decoder.onnx", "cpu"],
    ]);
    expect(Object.fromEntries(Object.entries(seg.providers).map(([k, v]) => [k, v.ep]))).toEqual({ image: "cpu", language: "cpu", decoder: "cpu" });
    await seg.dispose();
    expect(ort.sessions.every((s) => s.released)).toBe(true);
  });

  it("releases the sessions that loaded when a later one fails", async () => {
    const ort = fakeOrt({ failOn: "decoder" });
    await expect(createSegmenter({ files: await files(), ort, executionProvider: "cpu" })).rejects.toThrow(/no decoder/);
    expect(ort.sessions).toHaveLength(2);
    expect(ort.sessions.every((s) => s.released)).toBe(true);
  });

  it("needs the model's files and the module", async () => {
    const f = await files();
    await expect(createSegmenter({ files: { ...f, tokenizer: undefined }, ort: fakeOrt() })).rejects.toThrow(/files/);
    await expect(createSegmenter({ files: f })).rejects.toThrow(/ort/);
  });
});
