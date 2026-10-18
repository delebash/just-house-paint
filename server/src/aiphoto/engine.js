// SPDX-License-Identifier: MIT
// The AI photo's engine and weights: which stable-diffusion.cpp prebuilt this machine takes,
// installing it once, and the three FLUX.2 klein 4B files — all as DATA (the app seeds the
// rows into its database; an update changes a row, not code).
//
// The shape follows the kit's llama.cpp binaries (@delebash/core runner/config.js
// DEFAULT_BINARIES + runner/binary.js ASSET_PATTERNS): the pinned release's own asset list
// seeds the rows, and anchored name patterns resolve any newer release's GitHub API answer —
// upstream renames assets (ROCm went 7.14.0 → 10.1.0 between master-951 and master-954), so a
// name is never composed from a tag. Backend order is the kit's `_gpuPreference`: Metal, CUDA,
// ROCm, Vulkan, then CPU.
//
// Downloads go through an INJECTED `download(url, dest, {onProgress(done, total), cancelCheck})`
// — the app passes the kit's resumable `streamDownload` (runner/download.js). Zips are unpacked
// with the kit's `extractZip` (platform/zip.js — CPython zipfile's extractall). Every file is
// checked against its published size and SHA-256 before it is used.

import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { extractZip } from "@delebash/core/platform/zip";

// ── stable-diffusion.cpp ────────────────────────────────────────────────────────────────────

const SD_REL = "https://github.com/leejet/stable-diffusion.cpp/releases/download/master-973-f0aac52";

export const ENGINE_RELEASES = Object.freeze({
  repo: "leejet/stable-diffusion.cpp", // MIT
  latestApi: "https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/latest",
  /**
   * Which asset each (platform, arch, backend) takes. `asset`/`runtime` are anchored regexes on
   * the asset name; `runtime` is a companion unpacked into the same folder (Windows CUDA's
   * cudart/cuBLAS DLLs ship as a separate zip). Checked against master-937 … master-973.
   * No Linux CUDA build is published (NVIDIA on Linux takes Vulkan); the macOS zip is one
   * universal (arm64 + x86_64) build with Metal compiled in (ggml_metal_* symbols present).
   */
  patterns: Object.freeze([
    {
      platform: "win32",
      arch: "x64",
      backend: "cuda12",
      asset: "^sd-.+-bin-win-cuda12-x64\\.zip$",
      runtime: "^cudart-sd-bin-win-cu12-x64\\.zip$",
      exe: "sd-cli.exe",
    },
    { platform: "win32", arch: "x64", backend: "rocm", asset: "^sd-.+-bin-win-rocm-[\\d.]+-x64\\.zip$", exe: "sd-cli.exe" },
    { platform: "win32", arch: "x64", backend: "vulkan", asset: "^sd-.+-bin-win-vulkan-x64\\.zip$", exe: "sd-cli.exe" },
    { platform: "win32", arch: "x64", backend: "cpu", asset: "^sd-.+-bin-win-cpu-x64\\.zip$", exe: "sd-cli.exe" },
    { platform: "darwin", arch: "arm64", backend: "metal", asset: "^sd-.+-bin-Darwin-macOS-[\\d.]+-arm64\\.zip$", exe: "sd-cli" },
    {
      platform: "linux",
      arch: "x64",
      backend: "rocm",
      asset: "^sd-.+-bin-Linux-Ubuntu-[\\d.]+-x86_64-rocm-[\\d.]+\\.zip$",
      exe: "sd-cli",
    },
    { platform: "linux", arch: "x64", backend: "vulkan", asset: "^sd-.+-bin-Linux-Ubuntu-[\\d.]+-x86_64-vulkan\\.zip$", exe: "sd-cli" },
    { platform: "linux", arch: "x64", backend: "cpu", asset: "^sd-.+-bin-Linux-Ubuntu-[\\d.]+-x86_64\\.zip$", exe: "sd-cli" },
  ]),
  /**
   * The pinned release, as GitHub's API returned it (GET …/releases/latest, 2026-10-17 —
   * name, size and the `digest` GitHub computes for every asset). The probe measured the
   * CUDA 12 and Vulkan builds of this release (RESEARCH §9).
   */
  pinned: Object.freeze({
    tag_name: "master-973-f0aac52",
    published_at: "2026-10-17T08:37:54Z",
    assets: Object.freeze(
      [
        ["cudart-sd-bin-win-cu12-x64.zip", 563452046, "fe20366827d357c00797eebb58244dddab7fd9a348d70090c3871004c320f38d"],
        [
          "sd-master-f0aac52-bin-Darwin-macOS-26.6.2-arm64.zip",
          36476923,
          "e5abc3b8a0ff81bd848b32b46d10a07fe33767a54240848ab53c8bc394c5ef95",
        ],
        [
          "sd-master-f0aac52-bin-Linux-Ubuntu-24.04-x86_64-rocm-10.1.0.zip",
          295412211,
          "4a222ada0c8cd6067527f5ea29879a790a0b50e215e5ad3cb8a5153c44da8edd",
        ],
        [
          "sd-master-f0aac52-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip",
          36611594,
          "6593b4427a027bd4ebe02f2d91c9a4388b777cd81485248d55bae136b5892d2b",
        ],
        [
          "sd-master-f0aac52-bin-Linux-Ubuntu-24.04-x86_64.zip",
          26288236,
          "9666a2fe3c05fcb0dc0752e63dfb225871353cb1495e02d0ae2ed172a6e80888",
        ],
        ["sd-master-f0aac52-bin-win-cpu-x64.zip", 17698980, "8544332b2fe7adb07eab45b61ea76d86f92b0cbbdc9b03585b73453db5b7f52b"],
        ["sd-master-f0aac52-bin-win-cuda12-x64.zip", 343638522, "68a7b08b87925a39dc1661d872a7625e633df90dc6e3c32165e7cb8815b7febf"],
        [
          "sd-master-f0aac52-bin-win-rocm-10.1.0-x64.zip",
          263998210,
          "d1ee3a9b6a90223531707599a7f630f3111d75b01cd431e85876e4b8d19e1161",
        ],
        ["sd-master-f0aac52-bin-win-vulkan-x64.zip", 29363455, "64ae41edf331723871ff6925f6f9d8bb46f6407d49e51f2073ef11f646765cb2"],
      ].map(([name, size, sha]) => Object.freeze({ name, size, digest: `sha256:${sha}`, browser_download_url: `${SD_REL}/${name}` })),
    ),
  }),
});

/** Backend names a caller may force; "cuda" is an alias of the one CUDA build. */
const BACKENDS = new Set(["metal", "cuda12", "rocm", "vulkan", "cpu"]);

/**
 * The backends to try on this machine, best first. `gpu` is the kit's `hardware.detect()`
 * result (or its `runtimes` — `{cuda, rocm, vulkan, metal}`), or a backend name to force.
 */
export function backendOrder(gpu, platform = process.platform) {
  if (typeof gpu === "string") {
    const want = gpu === "cuda" ? "cuda12" : gpu;
    if (!BACKENDS.has(want)) throw new TypeError(`unknown engine backend: ${gpu}`);
    return [want];
  }
  const rt = gpu?.runtimes ?? gpu ?? {};
  const order = [];
  if (rt.metal || platform === "darwin") order.push("metal"); // the macOS build is the Metal build
  if (rt.cuda) order.push("cuda12");
  if (rt.rocm) order.push("rocm");
  if (rt.vulkan) order.push("vulkan");
  order.push("cpu");
  return order;
}

const shaOf = (digest) => (typeof digest === "string" && digest.startsWith("sha256:") ? digest.slice(7) : null);
const fileOf = (a) => ({ name: a.name, url: a.browser_download_url, size: a.size, sha256: shaOf(a.digest) });

/**
 * A release's assets (GitHub API JSON: `{tag_name, assets: [{name, size, digest,
 * browser_download_url}]}`) resolved into install rows by the patterns:
 * `[{platform, arch, backend, exe, tag, asset: {name, url, size, sha256}, runtime | null}]`.
 * A pattern whose asset (or companion) is missing from the release yields no row.
 */
export function resolveReleaseAssets(release, patterns = ENGINE_RELEASES.patterns) {
  const rows = [];
  for (const p of patterns) {
    const find = (re) => (release.assets || []).find((a) => new RegExp(re).test(a.name));
    const asset = find(p.asset);
    const runtime = p.runtime ? find(p.runtime) : null;
    if (!asset || (p.runtime && !runtime)) continue;
    rows.push({
      platform: p.platform,
      arch: p.arch,
      backend: p.backend,
      exe: p.exe,
      tag: release.tag_name,
      asset: fileOf(asset),
      runtime: runtime ? fileOf(runtime) : null,
    });
  }
  return rows;
}

/** The install row for this machine (first backend of `backendOrder` the release has), or null. */
export function selectEngineAsset(
  release = ENGINE_RELEASES.pinned,
  { platform = process.platform, arch = process.arch, gpu, patterns = ENGINE_RELEASES.patterns } = {},
) {
  const rows = resolveReleaseAssets(release, patterns).filter((r) => r.platform === platform && r.arch === arch);
  for (const backend of backendOrder(gpu, platform)) {
    const row = rows.find((r) => r.backend === backend);
    if (row) return row;
  }
  return null;
}

// ── shared helpers ──────────────────────────────────────────────────────────────────────────

const abortError = () => new DOMException("The operation was cancelled", "AbortError");
const checkCancel = (cancelCheck) => {
  if (cancelCheck?.()) throw abortError();
};

/** SHA-256 (hex) of a file, streamed; `onBytes(n)` per chunk; honours cancelCheck. */
export async function sha256File(path, { cancelCheck = null, onBytes = null } = {}) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, { highWaterMark: 4 * 1024 * 1024 })) {
    checkCancel(cancelCheck);
    hash.update(chunk);
    onBytes?.(chunk.length);
  }
  return hash.digest("hex");
}

/** A size or SHA-256 mismatch of a downloaded file. */
export class IntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = "IntegrityError";
  }
}

/**
 * Have `file` ({name, url, size, sha256}) at `dest`, checked: a file already there with the
 * right size and hash is kept (a wrong one is deleted and fetched again); a fresh download
 * must match size and SHA-256 or it is deleted and IntegrityError thrown.
 * `onDownload(bytesDone)` / `onHash(bytesHashedSinceLastCall)` report progress.
 */
async function fetchVerified(file, dest, { download, cancelCheck, onDownload, onHash }) {
  const sound = async () => !file.sha256 || (await sha256File(dest, { cancelCheck, onBytes: onHash })) === file.sha256;
  if (existsSync(dest) && (await stat(dest)).size === file.size) {
    onDownload(file.size);
    if (await sound()) return;
    await rm(dest, { force: true });
  }
  if (typeof download !== "function") throw new TypeError("a download(url, dest, opts) function is required");
  await mkdir(dirname(dest), { recursive: true });
  await download(file.url, dest, { onProgress: (done) => onDownload(done), cancelCheck });
  checkCancel(cancelCheck);
  const got = existsSync(dest) ? (await stat(dest)).size : -1;
  if (got !== file.size) {
    await rm(dest, { force: true });
    throw new IntegrityError(`${file.name}: downloaded ${got} bytes, expected ${file.size}`);
  }
  onDownload(file.size);
  if (!(await sound())) {
    await rm(dest, { force: true });
    throw new IntegrityError(`${file.name}: the SHA-256 does not match ${file.sha256}`);
  }
}

/**
 * A monotonic 0..`span` bar over several files fetched one after another: each file's share
 * is its size; within it the download counts 0.85 and the hash 0.15.
 */
function byteMeter(total, onProgress, span = 1) {
  let base = 0;
  let last = 0;
  const emit = (fraction, stage, file) => {
    last = Math.max(last, Math.min(1, fraction));
    onProgress?.({ fraction: last, stage, file });
  };
  return {
    emit,
    file(f) {
      let got = 0;
      let hashed = 0;
      const at = () => (span * (base + 0.85 * got + 0.15 * hashed)) / (total || 1);
      return {
        onDownload: (done) => {
          got = Math.min(f.size, Math.max(got, done));
          emit(at(), "download", f.name);
        },
        onHash: (n) => {
          hashed = Math.min(f.size, hashed + n);
          emit(at(), "verify", f.name);
        },
        done: () => {
          base += f.size;
        },
      };
    },
  };
}

const inflight = new Map(); // one install per target folder at a time, in this process

function once(key, fn) {
  if (!inflight.has(key)) {
    inflight.set(
      key,
      fn().finally(() => inflight.delete(key)),
    );
  }
  return inflight.get(key);
}

const ENGINE_MARKER = ".aiphoto-engine.json";

/**
 * Install the sd.cpp build for this machine under `dir` once; return the sd-cli path (which
 * backend and release it is: `<dir>/<tag>/<backend>/.aiphoto-engine.json`, or
 * `selectEngineAsset` with the same arguments). Layout: `<dir>/<tag>/<backend>/`,
 * the zips under `<dir>/.downloads/` until unpacked (then deleted). `onProgress({fraction,
 * stage: "download" | "verify" | "extract" | "done", file})`. `gpu` as `backendOrder`; when
 * absent the kit's `hardware.detect()` decides. `release` defaults to the pinned one.
 */
export async function ensureEngine(
  dir,
  {
    download,
    onProgress = null,
    cancelCheck = null,
    gpu,
    release = ENGINE_RELEASES.pinned,
    platform = process.platform,
    arch = process.arch,
    extract = extractZip,
  } = {},
) {
  if (gpu === undefined) gpu = await (await import("@delebash/core/runner/hardware")).detect();
  const row = selectEngineAsset(release, { platform, arch, gpu });
  if (!row) throw new Error(`no stable-diffusion.cpp build for ${platform}/${arch} in ${release.tag_name}`);
  const home = join(dir, row.tag, row.backend);
  const bin = join(home, row.exe);
  if (existsSync(join(home, ENGINE_MARKER)) && existsSync(bin)) {
    onProgress?.({ fraction: 1, stage: "done", file: row.asset.name });
    return bin;
  }
  return once(home, async () => {
    const files = [row.asset, ...(row.runtime ? [row.runtime] : [])];
    // The bar: fetch + verify 0..0.9, unpack 0.9..1.
    const meter = byteMeter(
      files.reduce((s, f) => s + f.size, 0),
      onProgress,
      0.9,
    );
    const report = (fraction, stage, file) => meter.emit(fraction, stage, file);
    const downloads = join(dir, ".downloads");
    for (const f of files) {
      const m = meter.file(f);
      await fetchVerified(f, join(downloads, f.name), { download, cancelCheck, ...m });
      m.done();
    }
    checkCancel(cancelCheck);
    const partial = `${home}.partial`;
    await rm(partial, { recursive: true, force: true });
    await mkdir(partial, { recursive: true });
    for (const [i, f] of files.entries()) {
      report(0.9 + (0.1 * i) / files.length, "extract", f.name);
      await extract(join(downloads, f.name), partial);
      checkCancel(cancelCheck);
    }
    if (!existsSync(join(partial, row.exe))) throw new Error(`${row.asset.name} has no ${row.exe}`);
    if (platform !== "win32") {
      for (const exe of ["sd-cli", "sd-server"]) if (existsSync(join(partial, exe))) await chmod(join(partial, exe), 0o755);
    }
    const marker = { tag: row.tag, backend: row.backend, asset: row.asset, runtime: row.runtime, installedAt: new Date().toISOString() };
    await writeFile(join(partial, ENGINE_MARKER), JSON.stringify(marker, null, 2));
    await rm(home, { recursive: true, force: true });
    await rename(partial, home);
    for (const f of files) await rm(join(downloads, f.name), { force: true });
    report(1, "done", row.asset.name);
    return bin;
  });
}

// ── FLUX.2 klein 4B weights ────────────────────────────────────────────────────────────────

/**
 * The three model files (all Apache-2.0), pinned to the Hugging Face commit they were
 * checked at; `sha256` is the LFS object id the HF API lists, re-computed on the probe's
 * local copies (data/probe/models/flux2-klein, 2026-10-17) — they match.
 */
export const MODEL_FILES = Object.freeze({
  diffusion: Object.freeze({
    file: "flux-2-klein-4b-Q8_0.gguf",
    repo: "leejet/FLUX.2-klein-4B-GGUF",
    revision: "3b1f5a9dc3abb32238b053aeb3d823c30afdacbd",
    path: "flux-2-klein-4b-Q8_0.gguf",
    url: "https://huggingface.co/leejet/FLUX.2-klein-4B-GGUF/resolve/3b1f5a9dc3abb32238b053aeb3d823c30afdacbd/flux-2-klein-4b-Q8_0.gguf",
    size: 4300629440,
    sha256: "0bba6951258ec8f92d51114a8fa13e66828297bfff58a738f52729b3ef66fa28",
    license: "apache-2.0",
  }),
  llm: Object.freeze({
    file: "Qwen3-4B-Q8_0.gguf",
    repo: "unsloth/Qwen3-4B-GGUF",
    revision: "22c9fc8a8c7700b76a1789366280a6a5a1ad1120",
    path: "Qwen3-4B-Q8_0.gguf",
    url: "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/22c9fc8a8c7700b76a1789366280a6a5a1ad1120/Qwen3-4B-Q8_0.gguf",
    size: 4280405792,
    sha256: "eed555233267a33c7e8ee31682762cc7751b3f6d224039086e0e846f05fffa5d",
    license: "apache-2.0",
  }),
  vae: Object.freeze({
    file: "flux2-klein-vae.safetensors",
    repo: "black-forest-labs/FLUX.2-klein-4B",
    revision: "e7b7dc27f91deacad38e78976d1f2b499d76a294",
    path: "vae/diffusion_pytorch_model.safetensors",
    url: "https://huggingface.co/black-forest-labs/FLUX.2-klein-4B/resolve/e7b7dc27f91deacad38e78976d1f2b499d76a294/vae/diffusion_pytorch_model.safetensors",
    size: 168120878,
    sha256: "ca70d2202afe6415bdbcb8793ba8cd99fd159cfe6192381504d6c4d3036e0f04",
    license: "apache-2.0",
  }),
});

/** A MODEL_FILES row's download URL (the HF `resolve` URL at its pinned revision). */
export const modelUrl = (m) => m.url ?? `https://huggingface.co/${m.repo}/resolve/${m.revision}/${m.path}`;

const MODELS_MANIFEST = ".aiphoto-models.json";

/**
 * Have the model files under `dir` (downloading what is missing, checking each new file's
 * SHA-256 once — the result is remembered in `<dir>/.aiphoto-models.json` by size and mtime);
 * return `{diffusion, llm, vae}` paths. `onProgress({fraction, stage, file})`.
 */
export async function ensureModels(dir, { download, onProgress = null, cancelCheck = null, files = MODEL_FILES } = {}) {
  return once(join(dir, MODELS_MANIFEST), async () => {
    await mkdir(dir, { recursive: true });
    const manifestPath = join(dir, MODELS_MANIFEST);
    let manifest = {};
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      manifest = {};
    }
    const entries = Object.entries(files);
    const known = async (m) => {
      const p = join(dir, m.file);
      if (!existsSync(p)) return false;
      const st = await stat(p);
      const seen = manifest[m.file];
      return st.size === m.size && seen?.sha256 === m.sha256 && seen.size === st.size && seen.mtimeMs === st.mtimeMs;
    };
    const todo = [];
    for (const [, m] of entries) if (!(await known(m))) todo.push(m);
    const meter = byteMeter(
      todo.reduce((s, m) => s + m.size, 0),
      onProgress,
    );
    for (const m of todo) {
      const dest = join(dir, m.file);
      const file = { name: m.file, url: modelUrl(m), size: m.size, sha256: m.sha256 };
      const bar = meter.file(file);
      await fetchVerified(file, dest, { download, cancelCheck, ...bar });
      bar.done();
      const st = await stat(dest);
      manifest[m.file] = { sha256: m.sha256, size: st.size, mtimeMs: st.mtimeMs };
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    }
    meter.emit(1, "done", null);
    return Object.fromEntries(entries.map(([k, m]) => [k, join(dir, m.file)]));
  });
}
