// SPDX-License-Identifier: MIT
// aiRepaint end to end with a fake sd-cli: the fake reads the working-size inputs it was
// given and writes a "render" that is off-color inside the mask and drifted everywhere else
// (as the real VAE round trip drifts) — the paste-back must restore every outside pixel and
// the lock must hit the paint.
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { aiRepaint, cappedSize } from "../../src/aiphoto/edit.js";
import { DEFAULT_COMPOSE, featherMask, readMask, readRgb } from "../../src/aiphoto/pixels.js";
import { argOf, fakeSpawn } from "./helpers.js";

const W = 640;
const H = 480;
const tmp = () => mkdtempSync(join(tmpdir(), "aiphoto-edit-"));
const models = { diffusion: "d.gguf", llm: "l.gguf", vae: "v.safetensors" };

/** A house-ish photo: sky, a white wall lit from the left with a shadow band, a dark door. */
async function photoPng() {
  const b = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      let c = [120, 160, 220]; // sky
      if (y > 120) c = [235 - x / 20, 232 - x / 20, 225 - x / 20]; // wall
      if (y > 120 && x > 300 && x < 340) c = [140, 138, 134]; // shadow band
      if (y > 300 && x > 420 && x < 500) c = [40, 30, 28]; // door
      if (y > 440) c = [70, 120, 60]; // grass
      b.set(c.map(Math.round), i);
    }
  return sharp(b, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

/** A white-on-black mask PNG of the given rectangles [x0, y0, x1, y1], at w×h. */
function rectMask(rects, w = W, h = H) {
  const b = Buffer.alloc(w * h);
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) b[y * w + x] = 255;
  return sharp(b, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
}

const WALL = [[0, 121, 640, 440]];
const DOOR = [[421, 301, 499, 440]];

/** The fake sd-cli: inside the mask a dull pinkish brown keeping the init's shading; outside +9 drift. */
function fakeSd(chunks = PROGRESS_CHUNKS, extra = {}) {
  const seen = {};
  const fake = fakeSpawn({
    chunks,
    ...extra,
    onStart: async (argv) => {
      seen.argv = argv;
      const w = Number(argOf(argv, "-W"));
      const h = Number(argOf(argv, "-H"));
      const init = await sharp(argOf(argv, "-i")).raw().toBuffer({ resolveWithObject: true });
      const mask = await sharp(argOf(argv, "--mask")).greyscale().raw().toBuffer();
      seen.init = init.info;
      seen.maskWhite = mask.reduce((s, v) => s + (v > 127 ? 1 : 0), 0);
      const out = Buffer.alloc(w * h * 3);
      for (let i = 0; i < w * h; i++) {
        const shade = (init.data[i * 3] + init.data[i * 3 + 1] + init.data[i * 3 + 2]) / (3 * 235);
        const c = mask[i] > 127 ? [136 * shade, 72 * shade, 66 * shade] : [0, 1, 2].map((k) => init.data[i * 3 + k] + 9);
        out.set(c.map((v) => Math.max(0, Math.min(255, Math.round(v)))), i * 3);
      }
      await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toFile(argOf(argv, "-o"));
    },
  });
  return { ...fake, seen };
}

const PROGRESS_CHUNKS = [
  "[I] loading diffusion model from 'd.gguf' --- diffusion_engine.cpp:738\n",
  "[I] generate_image 320x240 --- image.cpp:814\n",
  "[I] encode_first_stage completed, taking 1.40s --- image.cpp:398\n",
  "[I] get_learned_condition completed, taking 1.77s --- image.cpp:529\n",
  ...[1, 2, 3, 4].map((s) => `  |=====>    | ${s}/4 - 2.61s/it\x1b[K`),
  "[I] sampling completed, taking 12.12s --- image.cpp:899\n",
  "[I] decode_first_stage completed, taking 1.11s --- image.cpp:624\n",
].map((text) => ({ stream: "stdout", text }));

/** Count the bytes outside the feathered masks that differ from the photo. */
async function outsideDiffers(photo, outPath, masks) {
  const p = await readRgb(photo);
  const o = await readRgb(outPath);
  const union = new Float32Array(W * H);
  for (const m of masks) {
    const soft = await featherMask(await readMask(m, W, H), W, H, DEFAULT_COMPOSE.featherPx);
    for (let i = 0; i < union.length; i++) union[i] = Math.max(union[i], soft[i]);
  }
  let n = 0;
  let outside = 0;
  for (let i = 0; i < union.length; i++) {
    if (union[i] > 0) continue;
    outside++;
    for (let k = 0; k < 3; k++) if (o.data[i * 3 + k] !== p.data[i * 3 + k]) n++;
  }
  return { differ: n, outside, size: [o.width, o.height] };
}

describe("aiRepaint", () => {
  test("one surface: working size, paste-back exact outside, locked to the paint", async () => {
    const dir = tmp();
    const photo = await photoPng();
    const mask = await rectMask(WALL);
    const sd = fakeSd();
    const events = [];
    const r = await aiRepaint({
      engine: { bin: "C:/engine/sd-cli.exe" },
      models,
      photo,
      mask,
      colorHex: "#AD2C34",
      colorName: "Positive Red",
      surfaceLabel: "siding",
      outPath: join(dir, "out.png"),
      unlockedPath: join(dir, "unlocked.png"),
      size: { width: 320, height: 240 },
      onProgress: (e) => events.push(e),
      spawn: sd.spawn,
    });
    expect(sd.seen.argv[0]).toBe("C:/engine/sd-cli.exe");
    expect(sd.seen.init).toMatchObject({ width: 320, height: 240 });
    expect(argOf(sd.seen.argv, "-p")).toBe(
      "Repaint only the siding of this house in Positive Red, color #AD2C34 exterior paint. Keep everything else in the photo exactly the same, including the lighting.",
    );
    expect(argOf(sd.seen.argv, "-r")).toBe(argOf(sd.seen.argv, "-i"));
    expect(r.workingSize).toEqual({ width: 320, height: 240 });
    expect(r.size).toEqual({ width: W, height: H });
    expect(r.deltaE).toBeLessThan(0.5);
    expect(r.deltaEUnlocked).toBeGreaterThan(5);
    expect(r.surfaces[0]).toMatchObject({ surfaceLabel: "siding", colorHex: "#ad2c34", litMedian: "#ad2c34" });
    expect(r.surfaces[0].litPixels).toBeGreaterThan(1000);
    expect(Object.keys(r.timings)).toEqual(["prepareMs", "generateMs", "composeMs", "totalMs"]);
    const check = await outsideDiffers(photo, r.path, [mask]);
    expect(check.size).toEqual([W, H]);
    expect(check.outside).toBeGreaterThan(30000);
    expect(check.differ).toBe(0); // the +9 drift the "VAE" added outside is gone
    const fr = events.map((e) => e.fraction);
    for (let i = 1; i < fr.length; i++) expect(fr[i]).toBeGreaterThanOrEqual(fr[i - 1]);
    expect(fr.at(-1)).toBe(1);
    expect(events.filter((e) => e.sdStage === "sample" && e.step > 0).map((e) => e.step)).toEqual([1, 2, 3, 4]);
  });

  test("a mask of another size is stretched to the photo; the default working size is ~0.79 MP", async () => {
    const photo = await photoPng();
    const sd = fakeSd();
    const r = await aiRepaint({
      engine: "sd-cli",
      models,
      photo,
      mask: await rectMask([[0, 61, 320, 220]], 320, 240),
      colorHex: "#2f3d4c",
      surfaceLabel: "siding",
      outPath: join(tmp(), "o.png"),
      spawn: sd.spawn,
    });
    expect(r.workingSize).toEqual({ width: 640, height: 480 }); // smaller than the budget: not upscaled
    expect(r.deltaE).toBeLessThan(0.5);
  });

  test("several surfaces: one union mask in, each surface locked to its own paint", async () => {
    const photo = await photoPng();
    const wall = await rectMask(WALL);
    const door = await rectMask(DOOR);
    const sd = fakeSd();
    const r = await aiRepaint({
      engine: "sd-cli",
      models,
      photo,
      surfaces: [
        { mask: wall, colorHex: "#ad2c34", colorName: "Positive Red", surfaceLabel: "siding" },
        { mask: door, colorHex: "#2f3d4c", colorName: "Naval", surfaceLabel: "front door" },
      ],
      outPath: join(tmp(), "o.png"),
      size: { width: 320, height: 240 },
      spawn: sd.spawn,
    });
    expect(argOf(sd.seen.argv, "-p")).toBe(
      "Repaint this house's exterior paint: the siding in Positive Red, color #AD2C34; the front door in Naval, color #2F3D4C. Keep everything else in the photo exactly the same, including the lighting.",
    );
    expect(sd.seen.maskWhite).toBeGreaterThan(320 * 150); // the wall (which holds the door)
    expect(r.surfaces.map((s) => s.surfaceLabel)).toEqual(["siding", "front door"]);
    for (const s of r.surfaces) expect(s.deltaE).toBeLessThan(0.5);
    expect(r.deltaE).toBe(Math.max(...r.surfaces.map((s) => s.deltaE)));
    // The door overlaps the wall: the later surface owns it, so the wall's statistics skip it.
    const wallPx = (WALL[0][2] - WALL[0][0]) * (WALL[0][3] - WALL[0][1]);
    const doorPx = (DOOR[0][2] - DOOR[0][0]) * (DOOR[0][3] - DOOR[0][1]);
    expect(r.surfaces[0].surfacePixels).toBe(wallPx - doorPx);
    expect(r.surfaces[1].surfacePixels).toBe(doorPx);
    const out = await readRgb(r.path);
    const at = (x, y) => [...out.data.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)];
    expect(at(460, 380)[2]).toBeGreaterThan(at(460, 380)[0]); // the door is navy, not red
    expect(at(100, 200)[0]).toBeGreaterThan(at(100, 200)[2]); // the wall is red
  });

  test("an empty mask or a bad color is refused before sd-cli starts", async () => {
    const sd = fakeSd();
    const base = { engine: "sd-cli", models, photo: await photoPng(), surfaceLabel: "siding", outPath: join(tmp(), "o.png"), spawn: sd.spawn };
    await expect(aiRepaint({ ...base, mask: await rectMask([]), colorHex: "#ad2c34" })).rejects.toThrow(/siding mask is empty/);
    await expect(aiRepaint({ ...base, mask: await rectMask(WALL), colorHex: "red" })).rejects.toThrow(/#rrggbb/);
    await expect(aiRepaint({ ...base, mask: await rectMask(WALL), colorHex: "#ad2c34", surfaceLabel: " " })).rejects.toThrow(/surfaceLabel/);
    expect(sd.calls).toHaveLength(0);
  });

  test("cancel mid-sampling: sd-cli killed, AbortError, no output, work folder removed", async () => {
    const work = tmp();
    const out = join(tmp(), "o.png");
    const sd = fakeSd(PROGRESS_CHUNKS, { pauseAfter: 6 });
    const ac = new AbortController();
    const run = aiRepaint({
      engine: "sd-cli",
      models,
      photo: await photoPng(),
      mask: await rectMask(WALL),
      colorHex: "#ad2c34",
      surfaceLabel: "siding",
      outPath: out,
      size: { width: 320, height: 240 },
      workDir: work,
      signal: ac.signal,
      spawn: sd.spawn,
      onProgress: (e) => {
        if (e.step === 2) ac.abort();
      },
    });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(sd.calls[0].proc.killedWith).toBe("SIGKILL");
    expect(readdirSync(work)).toEqual([]);
    expect(readdirSync(join(out, ".."))).toEqual([]);
  });
});

describe("the lock covers only what the AI repainted (RESEARCH §10: the pink trim)", () => {
  // The fake AI paints the wall but leaves a white trim band (photo x 100–140) as it was.
  function fakeSdKeepingTrim() {
    return fakeSpawn({
      chunks: PROGRESS_CHUNKS,
      onStart: async (argv) => {
        const w = Number(argOf(argv, "-W"));
        const h = Number(argOf(argv, "-H"));
        const init = await sharp(argOf(argv, "-i")).raw().toBuffer({ resolveWithObject: true });
        const mask = await sharp(argOf(argv, "--mask")).greyscale().raw().toBuffer();
        const out = Buffer.alloc(w * h * 3);
        for (let i = 0; i < w * h; i++) {
          const x = (i % w) * (W / w);
          const keep = mask[i] <= 127 || (x >= 100 && x < 140);
          const shade = (init.data[i * 3] + init.data[i * 3 + 1] + init.data[i * 3 + 2]) / (3 * 235);
          const c = keep ? [0, 1, 2].map((k) => init.data[i * 3 + k]) : [136 * shade, 72 * shade, 66 * shade];
          out.set(c.map((v) => Math.max(0, Math.min(255, Math.round(v)))), i * 3);
        }
        await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toFile(argOf(argv, "-o"));
      },
    });
  }

  async function run(compose) {
    const dir = tmp();
    const r = await aiRepaint({
      engine: { bin: "C:/engine/sd-cli.exe" },
      models,
      photo: await photoPng(),
      mask: await rectMask(WALL),
      colorHex: "#AD2C34",
      surfaceLabel: "siding",
      outPath: join(dir, "out.png"),
      size: { width: 320, height: 240 },
      spawn: fakeSdKeepingTrim().spawn,
      ...(compose ? { compose } : {}),
    });
    const out = await readRgb(r.path);
    const px = (x, y) => [...out.data.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)];
    return { r, trim: px(120, 200), wall: px(220, 200) };
  }

  test("trim the AI left white stays white; the repainted wall is the paint", async () => {
    const { r, trim, wall } = await run();
    expect(Math.min(...trim)).toBeGreaterThan(200); // still white, not pink
    expect(wall[0]).toBeGreaterThan(wall[1] + 60); // red
    expect(r.deltaE).toBeLessThan(1);
  });

  test("with lockOnlyRepainted off, the old behavior locks the trim too", async () => {
    const { trim } = await run({ ...DEFAULT_COMPOSE, lockOnlyRepainted: false });
    expect(trim[0]).toBeGreaterThan(trim[1] + 60); // the trim turned paint-colored
  });
});

describe("a surface whose paint now is known (the light on it)", () => {
  test("the lock paints the new color in the light the paint now gives; its ΔE is to that", async () => {
    const photo = await photoPng();
    const sd = fakeSd();
    // the wall is photographed ~#e6e3dc where lit: say it is white paint now — a dimmer, warmer light
    const r = await aiRepaint({
      engine: "sd-cli",
      models,
      photo,
      mask: await rectMask(WALL),
      colorHex: "#AD2C34",
      colorName: "Positive Red",
      surfaceLabel: "siding",
      currentHex: "#ffffff",
      outPath: join(tmp(), "o.png"),
      size: { width: 320, height: 240 },
      spawn: sd.spawn,
    });
    const s = r.surfaces[0];
    expect(s.gain.every((g) => g < 1)).toBe(true);
    expect(s.gain[0]).toBeGreaterThan(s.gain[2]); // the photo's wall is warmer than white
    expect(s.litHex).not.toBe("#ad2c34");
    expect(s.litMedian).toBe(s.litHex);
    expect(s.deltaE).toBeLessThan(0.5);
    // the same run without it locks to the chip
    const plain = await aiRepaint({
      engine: "sd-cli",
      models,
      photo,
      mask: await rectMask(WALL),
      colorHex: "#AD2C34",
      surfaceLabel: "siding",
      outPath: join(tmp(), "p.png"),
      size: { width: 320, height: 240 },
      spawn: fakeSd().spawn,
    });
    expect(plain.surfaces[0]).toMatchObject({ litHex: "#ad2c34", litMedian: "#ad2c34", gain: [1, 1, 1] });
  });
});

// Settings → General photos.fullSizeMaxMegapixels: a 48 MP photo held 6 GB composing at full size (2026-10-20)
test("the photo is read at most at the full-size cap, its aspect kept", async () => {
  const photo = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#888" } }).png().toBuffer();
  expect(await cappedSize(photo, null)).toBeNull();
  expect(await cappedSize(photo, 16e6)).toBeNull(); // 12 MP: its own size
  const s = await cappedSize(photo, 1e6);
  expect(s.width * s.height).toBeLessThanOrEqual(1e6);
  expect(s.width / s.height).toBeCloseTo(4 / 3, 2);
});
