// SPDX-License-Identifier: MIT
// The SAM 3 model files and how they get onto disk. The bundle is samexporter's published export
// (huggingface.co/nrl-ai/samexporter-onnx-models, folder sam3/, from facebook/sam3 at opset 18, fp32;
// Meta's SAM License, shipped as LICENSE); the CLIP tokenizer is openai/clip-vit-base-patch32's
// tokenizer.json, which reproduces samexporter's test token ids (facebook/sam3's own is gated).
// URLs are pinned to a commit so the hashes below can't drift.
//
// `ensureModels` takes the downloader as an argument — the app passes the kit's resumable
// `streamDownload(url, dest, { onProgress(done, total), cancelCheck })`.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { sameFileTime } from "@delebash/core/platform/file_time";
import { renameHeld } from "@delebash/core/platform/rename_held";

export const SAM3_REPO = "nrl-ai/samexporter-onnx-models";
export const SAM3_REVISION = "5050a79cd4b912dd745fff83047c4ef6fbd97be5"; // main on 2026-10-17
export const CLIP_REPO = "openai/clip-vit-base-patch32";
export const CLIP_REVISION = "3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268"; // main on 2026-10-17

const hf = (repo, revision, file) => `https://huggingface.co/${repo}/resolve/${revision}/${file}`;
const sam3 = (name, size, sha256) => ({ name, url: hf(SAM3_REPO, SAM3_REVISION, `sam3/${name}`), size, sha256 });
const clip = (name, size, sha256) => ({ name, url: hf(CLIP_REPO, CLIP_REVISION, name), size, sha256 });

/** Every file the segmenter needs in its model folder: name on disk, source URL, bytes, SHA-256.
 * SAM 3 hashes: the repo's CHECKSUMS.sha256 and its LFS oids (they agree); the small files were
 * hashed locally after their git blob ids matched the Hub's. */
export const MODEL_FILES = Object.freeze(
  [
    sam3("sam3_image_encoder.onnx", 1815749196, "2a11b1a774c3cbda35f493878b2e5610e5af8ec77412daca228a7d9b9307aa76"),
    sam3("sam3_language_encoder.onnx", 1413353283, "0cdc233d9655866fa09cc00699469ba029aeeebc869b8b28a3e5894fed531f1e"),
    sam3("sam3_decoder.onnx", 2416015, "9819047760bac79fe90fec924e904f74c752038d3c828d50d8d1b53f4e08d5b6"),
    sam3("sam3_decoder.onnx.data", 130416640, "681ea5e117a0ead55f87ef55efc5c19fed37ebc2ba94728b3c1abe18669a4c92"),
    sam3("LICENSE", 7353, "4dea99bfaa016e21bc860d73f344236bd1e5c4977d1a9a8fd32f822b500ae1be"),
    clip("tokenizer.json", 2224041, "b556ac8c99757ffb677208af34bc8c6721572114111a6e0aaf5fa69ff0b8d842"),
    clip("tokenizer_config.json", 592, "34b7336e4bee12e0a9730eaf5189f582ef3c3eea5027f65730e5717256755aad"),
  ].map(Object.freeze),
);

/** Total bytes of MODEL_FILES (~3.36 GB). */
export const MODEL_BYTES = MODEL_FILES.reduce((n, f) => n + f.size, 0);

/** Records which files were already hashed (size + mtime + sha256), so a later start doesn't
 * re-read 3.4 GB to trust them. */
export const STAMP_FILE = ".verified.json";

/** Thrown when `cancelCheck()` turns true between files (the injected downloader throws its own
 * error when cancelled mid-file). */
export class ModelDownloadCancelled extends Error {
  constructor(message = "model download cancelled") {
    super(message);
    this.name = "ModelDownloadCancelled";
  }
}

/** SHA-256 of a file, streamed. */
export async function sha256File(file, cancelCheck = null) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 4 * 1024 * 1024 })) {
    // Cancel answers while a 3 GB file is checked, not when the check ends
    if (cancelCheck?.()) throw new ModelDownloadCancelled();
    h.update(chunk);
  }
  return h.digest("hex");
}

async function readStamps(dir) {
  try {
    const s = JSON.parse(await readFile(path.join(dir, STAMP_FILE), "utf8"));
    return s && typeof s === "object" ? s : {};
  } catch {
    return {};
  }
}

async function writeStamps(dir, stamps) {
  const file = path.join(dir, STAMP_FILE);
  await writeFile(`${file}.tmp`, JSON.stringify(stamps, null, 2));
  // just written: an antivirus reading it holds it a moment (the kit's renameHeld)
  await renameHeld(`${file}.tmp`, file);
}

/** Is `file` on disk with the right size and hash? Hashes once, then trusts the stamp while the
 * size is unchanged and the mtime within 2 s (the kit's sameFileTime, rsync's --modify-window: a copy — Change
 * folder's, onto NTFS or FAT — moves a file's time by less; it re-hashed 3.4 GB after every move). */
async function isValid(dir, f, stamps, cancelCheck = null) {
  let st;
  try {
    st = await stat(path.join(dir, f.name));
  } catch {
    return false;
  }
  if (!st.isFile() || st.size !== f.size) return false;
  const s = stamps[f.name];
  if (s && s.size === st.size && sameFileTime(s.mtimeMs, st.mtimeMs) && s.sha256 === f.sha256) return true;
  const sha = await sha256File(path.join(dir, f.name), cancelCheck);
  if (sha !== f.sha256) return false;
  stamps[f.name] = { size: st.size, mtimeMs: st.mtimeMs, sha256: sha };
  return true;
}

/**
 * Make sure every model file is in `modelDir`, downloading what is missing or wrong.
 * `download(url, dest, { onProgress(done, total), cancelCheck })` is injected (the kit's
 * `streamDownload`). Each download is checked for size and SHA-256; a file that fails is deleted
 * and the call throws. `onProgress({ name, done, total, overallDone, overallTotal })` reports bytes
 * (overall = the files being downloaded this call). `cancelCheck()` is passed to the downloader and
 * checked between files. Returns `{ modelDir, files: [{ name, status: "present" | "downloaded" }] }`.
 */
export async function ensureModels(modelDir, { download, onProgress, cancelCheck, files = MODEL_FILES } = {}) {
  if (!modelDir) throw new TypeError("ensureModels needs a model folder");
  if (typeof download !== "function") throw new TypeError("ensureModels needs a download(url, dest, { onProgress, cancelCheck }) function");
  await mkdir(modelDir, { recursive: true });
  const stamps = await readStamps(modelDir);
  const status = new Map();
  const missing = [];
  for (const f of files) {
    if (cancelCheck?.()) throw new ModelDownloadCancelled();
    if (await isValid(modelDir, f, stamps, cancelCheck)) status.set(f.name, "present");
    else missing.push(f);
  }
  await writeStamps(modelDir, stamps);

  const overallTotal = missing.reduce((n, f) => n + f.size, 0);
  let base = 0;
  for (const f of missing) {
    if (cancelCheck?.()) throw new ModelDownloadCancelled();
    const dest = path.join(modelDir, f.name);
    delete stamps[f.name];
    await download(f.url, dest, {
      onProgress: (done, total) =>
        onProgress?.({ name: f.name, done, total: total ?? f.size, overallDone: base + done, overallTotal }),
      cancelCheck,
    });
    const st = await stat(dest).catch(() => null);
    const sha = st?.size === f.size ? await sha256File(dest) : null;
    if (!st || st.size !== f.size || sha !== f.sha256) {
      await rm(dest, { force: true });
      const got = !st ? "no file" : st.size !== f.size ? `${st.size} bytes, expected ${f.size}` : `SHA-256 ${sha.slice(0, 12)}…, expected ${f.sha256.slice(0, 12)}…`;
      throw new Error(`${f.name} from ${f.url} failed verification (${got}) — deleted`);
    }
    stamps[f.name] = { size: st.size, mtimeMs: st.mtimeMs, sha256: sha };
    await writeStamps(modelDir, stamps);
    status.set(f.name, "downloaded");
    base += f.size;
  }
  return { modelDir, files: files.map((f) => ({ name: f.name, status: status.get(f.name) })) };
}
