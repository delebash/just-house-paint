// SPDX-License-Identifier: MIT
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLIP_REVISION,
  ensureModels,
  MODEL_BYTES,
  MODEL_FILES,
  ModelDownloadCancelled,
  SAM3_REVISION,
  STAMP_FILE,
  sha256File,
} from "../../src/segment/models.js";
import { MODEL_NAMES } from "../../src/segment/segmenter.js";

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

describe("MODEL_FILES", () => {
  it("lists the bundle and the tokenizer with pinned URLs, sizes and SHA-256", () => {
    const names = MODEL_FILES.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of [...Object.values(MODEL_NAMES), "sam3_decoder.onnx.data", "tokenizer.json", "tokenizer_config.json"]) {
      expect(names).toContain(n);
    }
    for (const f of MODEL_FILES) {
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(f.size) && f.size > 0).toBe(true);
      expect(f.url).toMatch(/^https:\/\/huggingface\.co\/.+\/resolve\/[0-9a-f]{40}\//);
    }
    expect(MODEL_FILES.find((f) => f.name === "sam3_image_encoder.onnx").url).toBe(
      `https://huggingface.co/nrl-ai/samexporter-onnx-models/resolve/${SAM3_REVISION}/sam3/sam3_image_encoder.onnx`,
    );
    expect(MODEL_FILES.find((f) => f.name === "tokenizer.json").url).toContain(`openai/clip-vit-base-patch32/resolve/${CLIP_REVISION}/`);
    expect(MODEL_BYTES).toBeGreaterThan(3.3e9);
    expect(MODEL_BYTES).toBeLessThan(3.4e9);
    expect(Object.isFrozen(MODEL_FILES) && Object.isFrozen(MODEL_FILES[0])).toBe(true);
  });
});

describe("ensureModels with a fake downloader", () => {
  let dir;
  const payload = { "a.onnx": Buffer.from("model A bytes"), "b.json": Buffer.from('{"b":1}') };
  const files = Object.entries(payload).map(([name, buf]) => ({ name, url: `https://example.test/${name}`, size: buf.length, sha256: sha(buf) }));

  /** Writes the right bytes (or `override[name]`), reporting progress in two steps. */
  const fakeDownload = (override = {}, calls = []) =>
    async function download(url, dest, { onProgress, cancelCheck }) {
      const name = path.basename(dest);
      calls.push({ url, name });
      if (cancelCheck?.()) throw new Error("DownloadCancelled");
      const buf = override[name] ?? payload[name];
      onProgress?.(Math.floor(buf.length / 2), buf.length);
      await writeFile(dest, buf);
      onProgress?.(buf.length, buf.length);
    };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "hp-models-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("downloads what is missing, verifies it, reports progress, and records a stamp", async () => {
    const calls = [];
    const progress = [];
    const r = await ensureModels(dir, { files, download: fakeDownload({}, calls), onProgress: (p) => progress.push(p) });
    expect(r.files).toEqual([
      { name: "a.onnx", status: "downloaded" },
      { name: "b.json", status: "downloaded" },
    ]);
    expect(calls.map((c) => c.url)).toEqual(files.map((f) => f.url));
    expect(await readFile(path.join(dir, "a.onnx"), "utf8")).toBe("model A bytes");
    const total = files[0].size + files[1].size;
    expect(progress.at(-1)).toEqual({ name: "b.json", done: files[1].size, total: files[1].size, overallDone: total, overallTotal: total });
    expect(progress.every((p) => p.overallTotal === total)).toBe(true);
    const stamps = JSON.parse(await readFile(path.join(dir, STAMP_FILE), "utf8"));
    expect(stamps["a.onnx"].sha256).toBe(files[0].sha256);
  });

  it("skips files already present and valid — no download at all", async () => {
    await ensureModels(dir, { files, download: fakeDownload() });
    const calls = [];
    const r = await ensureModels(dir, { files, download: fakeDownload({}, calls) });
    expect(calls).toEqual([]);
    expect(r.files.every((f) => f.status === "present")).toBe(true);
  });

  it("hashes a present file once when there is no stamp, then trusts it", async () => {
    await writeFile(path.join(dir, "a.onnx"), payload["a.onnx"]);
    const calls = [];
    const r = await ensureModels(dir, { files, download: fakeDownload({}, calls) });
    expect(r.files[0].status).toBe("present");
    expect(calls.map((c) => c.name)).toEqual(["b.json"]);
  });

  it("re-downloads a present file with the wrong size or content", async () => {
    await writeFile(path.join(dir, "a.onnx"), "short");
    await writeFile(path.join(dir, "b.json"), '{"b":2}'); // same size, wrong bytes
    const calls = [];
    const r = await ensureModels(dir, { files, download: fakeDownload({}, calls) });
    expect(calls.map((c) => c.name)).toEqual(["a.onnx", "b.json"]);
    expect(r.files.every((f) => f.status === "downloaded")).toBe(true);
  });

  it("a download that fails verification is deleted and the call throws", async () => {
    await expect(ensureModels(dir, { files, download: fakeDownload({ "a.onnx": Buffer.from("model X bytes") }) })).rejects.toThrow(
      /a\.onnx .* failed verification \(SHA-256/,
    );
    expect(existsSync(path.join(dir, "a.onnx"))).toBe(false);
    await expect(ensureModels(dir, { files, download: fakeDownload({ "a.onnx": Buffer.from("tiny") }) })).rejects.toThrow(/4 bytes, expected 13/);
  });

  it("cancelCheck stops between files (and reaches the downloader)", async () => {
    let n = 0;
    const cancelCheck = () => n++ >= 2; // false for the first file's checks, then true
    const calls = [];
    await expect(ensureModels(dir, { files, download: fakeDownload({}, calls), cancelCheck })).rejects.toBeInstanceOf(ModelDownloadCancelled);
    expect(calls.map((c) => c.name)).toEqual(["a.onnx"]);
    const r = await ensureModels(dir, { files, download: fakeDownload() });
    expect(r.files.map((f) => f.status)).toEqual(["present", "downloaded"]);
  });

  it("needs a downloader and a folder", async () => {
    await expect(ensureModels(dir, { files })).rejects.toThrow(TypeError);
    await expect(ensureModels("", { files, download: fakeDownload() })).rejects.toThrow(TypeError);
  });

  it("sha256File streams a file", async () => {
    const f = path.join(dir, "x.bin");
    const buf = Buffer.alloc(9 * 1024 * 1024, 7);
    await writeFile(f, buf);
    expect(await sha256File(f)).toBe(sha(buf));
    expect((await stat(f)).size).toBe(buf.length);
  });
});
