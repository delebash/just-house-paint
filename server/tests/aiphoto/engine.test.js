// SPDX-License-Identifier: MIT
// Release-asset selection per platform (on GitHub API JSON) and the one-time installs, with a
// fake download writing real zips (made by the kit's ZipWriter, unpacked by its extractZip).
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { ZipWriter } from "@delebash/core/platform/zip";
import { describe, expect, test, vi } from "vitest";

// A folder another program holds a moment (an antivirus reading the files just unpacked): the first rename of a
// path ending as armed in `held.ends` is refused with EBUSY, as Windows answers it; the rest are the real ones.
const held = vi.hoisted(() => ({ ends: new Set() }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal();
  const rename = async (from, to) => {
    for (const end of held.ends) {
      if (String(from).endsWith(end)) {
        held.ends.delete(end);
        throw Object.assign(new Error(`EBUSY: resource busy or locked, rename '${from}'`), { code: "EBUSY" });
      }
    }
    return real.rename(from, to);
  };
  return { ...real, rename, default: { ...real, rename } };
});
import {
  backendOrder,
  ENGINE_RELEASES,
  engineFiles,
  ensureEngine,
  ensureModels,
  IntegrityError,
  MODEL_FILES,
  modelUrl,
  resolveReleaseAssets,
  selectEngineAsset,
  UNPACK_ROOM,
} from "../../src/aiphoto/engine.js";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const tmp = () => mkdtempSync(join(tmpdir(), "aiphoto-engine-"));
const pick = (opts, release = ENGINE_RELEASES.pinned) => selectEngineAsset(release, opts);

/** A newer release as GitHub's API might answer: ROCm renamed again, the cudart zip missing. */
const NEWER = {
  tag_name: "master-990-abc1234",
  assets: [
    "sd-master-abc1234-bin-win-cuda12-x64.zip",
    "sd-master-abc1234-bin-win-rocm-11.0.0-x64.zip",
    "sd-master-abc1234-bin-win-vulkan-x64.zip",
    "sd-master-abc1234-bin-win-cpu-x64.zip",
    "sd-master-abc1234-bin-Darwin-macOS-27.1-arm64.zip",
    "sd-master-abc1234-bin-Linux-Ubuntu-26.04-x86_64-vulkan.zip",
    "sd-master-abc1234-bin-Linux-Ubuntu-26.04-x86_64.zip",
  ].map((name, i) => ({ name, size: 1000 + i, digest: `sha256:${String(i).repeat(64)}`, browser_download_url: `https://x/${name}` })),
};

describe("release-asset selection", () => {
  test("the pinned release resolves into one row per published build", () => {
    const rows = resolveReleaseAssets(ENGINE_RELEASES.pinned);
    expect(rows.map((r) => `${r.platform}/${r.arch}/${r.backend}`).sort()).toEqual(
      [
        "darwin/arm64/metal",
        "linux/x64/cpu",
        "linux/x64/rocm",
        "linux/x64/vulkan",
        "win32/x64/cpu",
        "win32/x64/cuda12",
        "win32/x64/rocm",
        "win32/x64/vulkan",
      ].sort(),
    );
    for (const r of rows) {
      expect(r.asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(r.asset.url).toBe(`https://github.com/leejet/stable-diffusion.cpp/releases/download/master-973-f0aac52/${r.asset.name}`);
      expect(r.tag).toBe("master-973-f0aac52");
    }
  });

  test("Windows + NVIDIA → the CUDA 12 build with its separate cudart zip", () => {
    const r = pick({ platform: "win32", arch: "x64", gpu: { runtimes: { cuda: true, vulkan: true } } });
    expect(r.backend).toBe("cuda12");
    expect(r.exe).toBe("sd-cli.exe");
    expect(r.asset.name).toBe("sd-master-f0aac52-bin-win-cuda12-x64.zip");
    expect(r.runtime).toMatchObject({ name: "cudart-sd-bin-win-cu12-x64.zip", size: 563452046 });
  });

  test("Windows AMD → ROCm, Vulkan-only → Vulkan, nothing → CPU", () => {
    expect(pick({ platform: "win32", arch: "x64", gpu: { rocm: true, vulkan: true } }).backend).toBe("rocm");
    expect(pick({ platform: "win32", arch: "x64", gpu: { vulkan: true } }).asset.name).toBe("sd-master-f0aac52-bin-win-vulkan-x64.zip");
    const cpu = pick({ platform: "win32", arch: "x64", gpu: {} });
    expect(cpu.backend).toBe("cpu");
    expect(cpu.runtime).toBeNull();
  });

  test("macOS arm64 → the Metal build; Intel Macs and Windows on ARM have none", () => {
    const r = pick({ platform: "darwin", arch: "arm64", gpu: {} });
    expect(r).toMatchObject({ backend: "metal", exe: "sd-cli" });
    expect(r.asset.name).toBe("sd-master-f0aac52-bin-Darwin-macOS-26.6.2-arm64.zip");
    expect(pick({ platform: "darwin", arch: "x64", gpu: {} })).toBeNull();
    expect(pick({ platform: "win32", arch: "arm64", gpu: { cuda: true } })).toBeNull();
  });

  test("Linux has no CUDA build: NVIDIA takes Vulkan, AMD ROCm, else CPU", () => {
    expect(pick({ platform: "linux", arch: "x64", gpu: { cuda: true, vulkan: true } }).backend).toBe("vulkan");
    expect(pick({ platform: "linux", arch: "x64", gpu: { cuda: true } }).backend).toBe("cpu");
    expect(pick({ platform: "linux", arch: "x64", gpu: { rocm: true, vulkan: true } }).asset.name).toBe(
      "sd-master-f0aac52-bin-Linux-Ubuntu-24.04-x86_64-rocm-10.1.0.zip",
    );
    expect(pick({ platform: "linux", arch: "x64", gpu: {} }).asset.name).toBe("sd-master-f0aac52-bin-Linux-Ubuntu-24.04-x86_64.zip");
  });

  test("a forced backend wins; 'cuda' is an alias; an unknown one is refused", () => {
    expect(backendOrder("vulkan")).toEqual(["vulkan"]);
    expect(backendOrder("cuda")).toEqual(["cuda12"]);
    expect(pick({ platform: "win32", arch: "x64", gpu: "cpu" }).backend).toBe("cpu");
    expect(() => backendOrder("opencl")).toThrow(/unknown engine backend/);
    expect(backendOrder({ cuda: true, rocm: true, vulkan: true, metal: true }, "win32")).toEqual(["metal", "cuda12", "rocm", "vulkan", "cpu"]);
  });

  test("a newer release resolves by pattern: renamed ROCm found, CUDA dropped without its cudart", () => {
    expect(pick({ platform: "win32", arch: "x64", gpu: { rocm: true } }, NEWER).asset.name).toBe("sd-master-abc1234-bin-win-rocm-11.0.0-x64.zip");
    const nv = pick({ platform: "win32", arch: "x64", gpu: { cuda: true, vulkan: true } }, NEWER);
    expect(nv.backend).toBe("vulkan");
    expect(nv.tag).toBe("master-990-abc1234");
    expect(pick({ platform: "darwin", arch: "arm64" }, NEWER).asset.name).toBe("sd-master-abc1234-bin-Darwin-macOS-27.1-arm64.zip");
  });
});

// ── installs ────────────────────────────────────────────────────────────────────────────────

function zipOf(files) {
  const w = new ZipWriter();
  for (const [name, data] of Object.entries(files)) w.writestr(name, Buffer.from(data));
  return w.toBuffer();
}

/** A release + a fake download serving `zips` ({assetName: Buffer}). */
function fakeRelease(zips, tag = "master-1-test") {
  const release = {
    tag_name: tag,
    assets: Object.entries(zips).map(([name, buf]) => ({ name, size: buf.length, digest: `sha256:${sha(buf)}`, browser_download_url: `https://dl/${name}` })),
  };
  const fetched = [];
  const download = async (url, dest, { onProgress } = {}) => {
    const name = basename(url);
    fetched.push(name);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, zips[name]);
    onProgress?.(zips[name].length, zips[name].length);
  };
  return { release, download, fetched };
}

const WIN_ZIPS = {
  "sd-x-bin-win-cuda12-x64.zip": zipOf({ "sd-cli.exe": "exe", "stable-diffusion.dll": "dll", "ggml-cuda.dll": "cuda" }),
  "cudart-sd-bin-win-cu12-x64.zip": zipOf({ "cudart64_12.dll": "rt", "cublas64_12.dll": "blas" }),
  "sd-x-bin-win-vulkan-x64.zip": zipOf({ "sd-cli.exe": "vk" }),
};

describe("ensureEngine", () => {
  test("installs the build and its cudart companion once, then reuses it", async () => {
    const dir = tmp();
    const { release, download, fetched } = fakeRelease(WIN_ZIPS);
    const events = [];
    const opts = { download, release, platform: "win32", arch: "x64", gpu: { cuda: true }, onProgress: (e) => events.push(e) };
    const got = await ensureEngine(dir, opts);
    expect(got).toBe(join(dir, "master-1-test", "cuda12", "sd-cli.exe"));
    expect(readFileSync(got, "utf8")).toBe("exe");
    expect(readFileSync(join(dirname(got), "cudart64_12.dll"), "utf8")).toBe("rt");
    expect(JSON.parse(readFileSync(join(dirname(got), ".aiphoto-engine.json"), "utf8"))).toMatchObject({ tag: "master-1-test", backend: "cuda12" });
    expect(existsSync(join(dir, ".downloads", "sd-x-bin-win-cuda12-x64.zip"))).toBe(false); // zips removed after unpacking
    expect(fetched).toEqual(["sd-x-bin-win-cuda12-x64.zip", "cudart-sd-bin-win-cu12-x64.zip"]);
    const fr = events.map((e) => e.fraction);
    for (let i = 1; i < fr.length; i++) expect(fr[i]).toBeGreaterThanOrEqual(fr[i - 1]);
    expect(events.at(-1)).toMatchObject({ fraction: 1, stage: "done" });
    expect(events.map((e) => e.stage)).toEqual(expect.arrayContaining(["download", "verify", "extract", "done"]));

    await ensureEngine(dir, opts);
    expect(fetched).toHaveLength(2); // nothing fetched the second time
  });

  test("two calls at once share one install", async () => {
    const dir = tmp();
    const { release, download, fetched } = fakeRelease(WIN_ZIPS);
    const opts = { download, release, platform: "win32", arch: "x64", gpu: "vulkan" };
    const [a, b] = await Promise.all([ensureEngine(dir, opts), ensureEngine(dir, opts)]);
    expect(a).toEqual(b);
    expect(fetched).toEqual(["sd-x-bin-win-vulkan-x64.zip"]);
  });

  test("a download whose SHA-256 differs from GitHub's digest is deleted and refused", async () => {
    const dir = tmp();
    const { release } = fakeRelease(WIN_ZIPS);
    const bad = async (url, dest) => {
      await mkdir(dirname(dest), { recursive: true });
      const good = WIN_ZIPS[basename(url)];
      writeFileSync(dest, Buffer.alloc(good.length, 7)); // right size, wrong bytes
    };
    const err = await ensureEngine(dir, { download: bad, release, platform: "win32", arch: "x64", gpu: "vulkan" }).catch((e) => e);
    expect(err).toBeInstanceOf(IntegrityError);
    expect(existsSync(join(dir, ".downloads", "sd-x-bin-win-vulkan-x64.zip"))).toBe(false);
    expect(existsSync(join(dir, "master-1-test", "vulkan"))).toBe(false);
  });

  test("cancel stops before anything is installed", async () => {
    const dir = tmp();
    const { release, download } = fakeRelease(WIN_ZIPS);
    let cancel = false;
    const slow = async (url, dest, o) => {
      await download(url, dest, o);
      cancel = true;
    };
    const err = await ensureEngine(dir, { download: slow, release, platform: "win32", arch: "x64", gpu: "vulkan", cancelCheck: () => cancel }).catch((e) => e);
    expect(err.name).toBe("AbortError");
    expect(existsSync(join(dir, "master-1-test", "vulkan", "sd-cli.exe"))).toBe(false);
  });

  test("installed is every file the release unpacked, not the marker: a file an antivirus took is fetched again", async () => {
    // a quarantined sd-cli or DLL left the marker, and "installed" was read from it alone — the render then failed
    // with Windows' exit 0xC0000135 (2026-10-20, the thirteenth review)
    const dir = tmp();
    const { release, download, fetched } = fakeRelease(WIN_ZIPS);
    const opts = { download, release, platform: "win32", arch: "x64", gpu: { cuda: true } };
    const bin = await ensureEngine(dir, opts);
    const home = dirname(bin);
    expect(JSON.parse(readFileSync(join(home, ".aiphoto-engine.json"), "utf8")).files.sort()).toEqual(
      ["cublas64_12.dll", "cudart64_12.dll", "ggml-cuda.dll", "sd-cli.exe", "stable-diffusion.dll"].sort(),
    );
    expect(engineFiles(home, "sd-cli.exe")).toEqual({ installed: true, missing: [] });
    rmSync(join(home, "stable-diffusion.dll"));
    expect(engineFiles(home, "sd-cli.exe")).toEqual({ installed: false, missing: ["stable-diffusion.dll"] });
    await ensureEngine(dir, opts);
    expect(fetched).toHaveLength(4); // both zips again
    expect(readFileSync(join(home, "stable-diffusion.dll"), "utf8")).toBe("dll");
    rmSync(bin);
    expect(engineFiles(home, "sd-cli.exe").missing).toEqual(["sd-cli.exe"]);
    expect(engineFiles(join(dir, "nothing-here"), "sd-cli.exe")).toEqual({ installed: false, missing: [] });
  });

  test("the unpacked engine moves in once an antivirus reading it lets go", async () => {
    // the rename of the folder just unpacked used to fail the install on the first refusal (the kit's renameHeld)
    const dir = tmp();
    const { release, download } = fakeRelease(WIN_ZIPS);
    held.ends.add("vulkan.partial");
    try {
      const bin = await ensureEngine(dir, { download, release, platform: "win32", arch: "x64", gpu: "vulkan" });
      expect(held.ends.size).toBe(0);
      expect(readFileSync(bin, "utf8")).toBe("vk");
    } finally {
      held.ends.clear();
    }
  });

  test("the pinned zips say what they unpack to; a newer release's are given room for five times their size", () => {
    const cuda = pick({ platform: "win32", arch: "x64", gpu: { cuda: true } });
    expect(cuda.asset.unpacked).toBe(388407429);
    expect(cuda.runtime.unpacked).toBe(788957696);
    const newer = pick({ platform: "win32", arch: "x64", gpu: { vulkan: true } }, NEWER);
    expect(newer.asset.unpacked).toBe(newer.asset.size * UNPACK_ROOM);
  });

  test("each build says what it needs from the system", () => {
    for (const backend of ["cuda12", "rocm", "vulkan", "cpu"]) {
      expect(pick({ platform: "win32", arch: "x64", gpu: backend }).requires.dlls).toEqual(["MSVCP140.dll", "VCRUNTIME140.dll", "VCRUNTIME140_1.dll", "VCOMP140.DLL"]);
    }
    expect(pick({ platform: "darwin", arch: "arm64", gpu: {} }).requires).toEqual({ macos: "26.0" });
    for (const gpu of ["rocm", "vulkan", "cpu"]) expect(pick({ platform: "linux", arch: "x64", gpu }).requires).toEqual({ glibc: "2.38" });
  });

  test("a platform with no build is a clear error", async () => {
    const { release, download } = fakeRelease(WIN_ZIPS);
    await expect(ensureEngine(tmp(), { download, release, platform: "darwin", arch: "x64", gpu: {} })).rejects.toThrow(/no stable-diffusion.cpp build for darwin\/x64/);
  });
});

describe("MODEL_FILES / ensureModels", () => {
  test("the pinned Hugging Face URLs", () => {
    expect(modelUrl(MODEL_FILES.diffusion)).toBe(
      "https://huggingface.co/leejet/FLUX.2-klein-4B-GGUF/resolve/3b1f5a9dc3abb32238b053aeb3d823c30afdacbd/flux-2-klein-4b-Q8_0.gguf",
    );
    expect(modelUrl(MODEL_FILES.llm)).toBe("https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/22c9fc8a8c7700b76a1789366280a6a5a1ad1120/Qwen3-4B-Q8_0.gguf");
    expect(modelUrl(MODEL_FILES.vae)).toBe(
      "https://huggingface.co/black-forest-labs/FLUX.2-klein-4B/resolve/e7b7dc27f91deacad38e78976d1f2b499d76a294/vae/diffusion_pytorch_model.safetensors",
    );
    for (const m of Object.values(MODEL_FILES)) {
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.url).toBe(`https://huggingface.co/${m.repo}/resolve/${m.revision}/${m.path}`);
    }
  });

  const body = { diffusion: Buffer.from("diffusion weights"), llm: Buffer.from("text encoder"), vae: Buffer.from("vae") };
  const files = Object.fromEntries(
    Object.entries(body).map(([k, b]) => [k, { file: `${k}.bin`, repo: "t/r", revision: "abc", path: `p/${k}.bin`, size: b.length, sha256: sha(b) }]),
  );
  const serve = (log, override = {}) => async (url, dest, { onProgress } = {}) => {
    const key = basename(url).replace(".bin", "");
    log.push(key);
    await mkdir(dirname(dest), { recursive: true });
    writeFileSync(dest, override[key] ?? body[key]);
    onProgress?.(body[key].length, body[key].length);
  };

  test("downloads what is missing, checks it, remembers it", async () => {
    const dir = tmp();
    const log = [];
    const events = [];
    const paths = await ensureModels(dir, { download: serve(log), files, onProgress: (e) => events.push(e) });
    expect(paths).toEqual({ diffusion: join(dir, "diffusion.bin"), llm: join(dir, "llm.bin"), vae: join(dir, "vae.bin") });
    expect(log).toEqual(["diffusion", "llm", "vae"]);
    expect(events.at(-1)).toMatchObject({ fraction: 1, stage: "done" });
    expect(Object.keys(JSON.parse(readFileSync(join(dir, ".aiphoto-models.json"), "utf8")))).toEqual(["diffusion.bin", "llm.bin", "vae.bin"]);
    await ensureModels(dir, { download: serve(log), files });
    expect(log).toHaveLength(3);
  });

  test("a file already there is hashed once instead of downloaded; a corrupt one is fetched again", async () => {
    const dir = tmp();
    writeFileSync(join(dir, "diffusion.bin"), body.diffusion); // e.g. copied in by hand
    writeFileSync(join(dir, "llm.bin"), Buffer.alloc(body.llm.length, 1)); // right size, wrong bytes
    const log = [];
    await ensureModels(dir, { download: serve(log), files });
    expect(log).toEqual(["llm", "vae"]);
    expect(readFileSync(join(dir, "llm.bin"))).toEqual(body.llm);
  });

  // the fifteenth review (2026-10-20): Change folder's copy keeps a file's time to the millisecond, NTFS to 100 ns —
  // compared exactly, 9 GB were hashed again after every move; now within 2 s (the kit's sameFileTime)
  test("a model whose time a copy moved by less than 2 s is known without hashing it again", async () => {
    const dir = tmp();
    await ensureModels(dir, { download: serve([]), files });
    const manifest = JSON.parse(readFileSync(join(dir, ".aiphoto-models.json"), "utf8"));
    const p = join(dir, "vae.bin");
    writeFileSync(p, Buffer.alloc(body.vae.length, 7)); // the same size, other bytes: a hash would refuse them
    const near = (manifest["vae.bin"].mtimeMs + 0.6) / 1000;
    utimesSync(p, near, near);
    const log = [];
    await ensureModels(dir, { download: serve(log), files });
    expect(log).toEqual([]);
    const far = (manifest["vae.bin"].mtimeMs + 5000) / 1000;
    utimesSync(p, far, far);
    await ensureModels(dir, { download: serve(log), files });
    expect(log).toEqual(["vae"]); // hashed, refused, fetched again
  });

  test("a download that never matches is refused", async () => {
    const dir = tmp();
    const err = await ensureModels(dir, { download: serve([], { vae: Buffer.from("VAE") }), files }).catch((e) => e);
    expect(err).toBeInstanceOf(IntegrityError);
    expect(existsSync(join(dir, "vae.bin"))).toBe(false);
  });
});
