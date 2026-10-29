// SPDX-License-Identifier: MIT
// aiRepaint end to end with a fake image feature (the kit's runImageFeature takes `{prompt, width, height, init, refs,
// mask}` as PNG Buffers and answers a PNG): the fake reads the working-size inputs it was given and draws a "render"
// that is off-color inside the mask and drifted everywhere else (as the real VAE round trip drifts) — the paste-back
// must restore every outside pixel and the lock must hit the paint.
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { aiRepaint, cappedSize } from "../../src/aiphoto/edit.js";
import { DEFAULT_COMPOSE, featherMask, readMask, readRgb } from "../../src/aiphoto/pixels.js";

const W = 640;
const H = 480;
const tmp = () => mkdtempSync(join(tmpdir(), "aiphoto-edit-"));

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

/**
 * The fake image feature: reports its four steps, honours the signal (`pauseAt`: it waits at that step until
 * cancelled), and draws `paint(init, mask, i, x)` — by default a dull pinkish brown inside the mask keeping the
 * init's shading, +9 drift outside. `seen` keeps what it was given; `calls` counts the runs.
 */
function fakeImage({ pauseAt = null, paint = null } = {}) {
  const seen = {};
  const fake = { seen, calls: 0, cancelled: false };
  fake.generate = async (request, { onProgress, signal }) => {
    fake.calls++;
    Object.assign(seen, request);
    const { width: w, height: h } = request;
    const init = await sharp(request.init).raw().toBuffer({ resolveWithObject: true });
    const mask = await sharp(request.mask).greyscale().raw().toBuffer();
    seen.initInfo = init.info;
    seen.maskWhite = mask.reduce((s, v) => s + (v > 127 ? 1 : 0), 0);
    for (let step = 1; step <= 4; step++) {
      if (step === pauseAt && !signal?.aborted) {
        await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      }
      if (signal?.aborted) {
        fake.cancelled = true;
        throw Object.assign(new Error("the image was cancelled"), { name: "AbortError" });
      }
      onProgress?.({ step, steps: 4, fraction: step / 4 });
    }
    const out = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      const shade = (init.data[i * 3] + init.data[i * 3 + 1] + init.data[i * 3 + 2]) / (3 * 235);
      const c = paint ? paint(init, mask, i, (i % w) * (W / w), shade) : mask[i] > 127 ? [136 * shade, 72 * shade, 66 * shade] : [0, 1, 2].map((k) => init.data[i * 3 + k] + 9);
      out.set(c.map((v) => Math.max(0, Math.min(255, Math.round(v)))), i * 3);
    }
    return sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  };
  return fake;
}

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
    const sd = fakeImage();
    const events = [];
    const r = await aiRepaint({
      generate: sd.generate,
      photo,
      mask,
      colorHex: "#AD2C34",
      colorName: "Positive Red",
      surfaceLabel: "siding",
      outPath: join(dir, "out.png"),
      unlockedPath: join(dir, "unlocked.png"),
      size: { width: 320, height: 240 },
      onProgress: (e) => events.push(e),
    });
    expect(sd.seen).toMatchObject({ width: 320, height: 240 });
    expect(sd.seen.initInfo).toMatchObject({ width: 320, height: 240 });
    expect(sd.seen.prompt).toBe(
      "Repaint only the siding of this house in Positive Red, color #AD2C34 exterior paint. Keep everything else in the photo exactly the same, including the lighting.",
    );
    expect(sd.seen.refs).toHaveLength(1);
    expect(sd.seen.refs[0].equals(sd.seen.init)).toBe(true); // the photo is both init and reference
    expect(r.workingSize).toEqual({ width: 320, height: 240 });
    expect(r.size).toEqual({ width: W, height: H });
    expect(r.deltaE).toBeLessThan(0.5);
    expect(r.deltaEUnlocked).toBeGreaterThan(5);
    expect(r.surfaces[0]).toMatchObject({ surfaceLabel: "siding", colorHex: "#ad2c34", litMedian: "#ad2c34" });
    expect(r.surfaces[0].litPixels).toBeGreaterThan(1000);
    expect(Object.keys(r.timings)).toEqual(["prepareMs", "generateMs", "closeUpMs", "composeMs", "totalMs"]);
    const check = await outsideDiffers(photo, r.path, [mask]);
    expect(check.size).toEqual([W, H]);
    expect(check.outside).toBeGreaterThan(30000);
    expect(check.differ).toBe(0); // the +9 drift the "VAE" added outside is gone
    const fr = events.map((e) => e.fraction);
    for (let i = 1; i < fr.length; i++) expect(fr[i]).toBeGreaterThanOrEqual(fr[i - 1]);
    expect(fr.at(-1)).toBe(1);
    expect(events.filter((e) => e.stage === "generate" && e.step > 0).map((e) => e.step)).toEqual([1, 2, 3, 4]);
  });

  test("a mask of another size is stretched to the photo; the default working size is ~0.79 MP", async () => {
    const photo = await photoPng();
    const sd = fakeImage();
    const r = await aiRepaint({
      generate: sd.generate,
      photo,
      mask: await rectMask([[0, 61, 320, 220]], 320, 240),
      colorHex: "#2f3d4c",
      surfaceLabel: "siding",
      outPath: join(tmp(), "o.png"),
    });
    expect(r.workingSize).toEqual({ width: 640, height: 480 }); // smaller than the budget: not upscaled
    expect(r.deltaE).toBeLessThan(0.5);
  });

  test("several surfaces: one union mask in, each surface locked to its own paint", async () => {
    const photo = await photoPng();
    const wall = await rectMask(WALL);
    const door = await rectMask(DOOR);
    const sd = fakeImage();
    const r = await aiRepaint({
      generate: sd.generate,
      photo,
      surfaces: [
        { mask: wall, colorHex: "#ad2c34", colorName: "Positive Red", surfaceLabel: "siding" },
        { mask: door, colorHex: "#2f3d4c", colorName: "Naval", surfaceLabel: "front door" },
      ],
      outPath: join(tmp(), "o.png"),
      size: { width: 320, height: 240 },
    });
    expect(sd.seen.prompt).toBe(
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

  test("an empty mask or a bad color is refused before anything is drawn", async () => {
    const sd = fakeImage();
    const base = { generate: sd.generate, photo: await photoPng(), surfaceLabel: "siding", outPath: join(tmp(), "o.png") };
    await expect(aiRepaint({ ...base, mask: await rectMask([]), colorHex: "#ad2c34" })).rejects.toThrow(/siding mask is empty/);
    await expect(aiRepaint({ ...base, mask: await rectMask(WALL), colorHex: "red" })).rejects.toThrow(/#rrggbb/);
    await expect(aiRepaint({ ...base, mask: await rectMask(WALL), colorHex: "#ad2c34", surfaceLabel: " " })).rejects.toThrow(/surfaceLabel/);
    await expect(aiRepaint({ ...base, generate: undefined, mask: await rectMask(WALL), colorHex: "#ad2c34" })).rejects.toThrow(/generate/);
    expect(sd.calls).toBe(0);
  });

  test("cancel mid-drawing: the drawing stops, AbortError, no output, work folder removed", async () => {
    const work = tmp();
    const out = join(tmp(), "o.png");
    const sd = fakeImage({ pauseAt: 3 });
    const ac = new AbortController();
    const run = aiRepaint({
      generate: sd.generate,
      photo: await photoPng(),
      mask: await rectMask(WALL),
      colorHex: "#ad2c34",
      surfaceLabel: "siding",
      outPath: out,
      size: { width: 320, height: 240 },
      workDir: work,
      signal: ac.signal,
      onProgress: (e) => {
        if (e.step === 2) ac.abort();
      },
    });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(sd.cancelled).toBe(true);
    expect(readdirSync(work)).toEqual([]);
    expect(readdirSync(join(out, ".."))).toEqual([]);
  });
});

describe("the lock covers only what the AI repainted (RESEARCH §10: the pink trim)", () => {
  // The fake AI paints the wall but leaves a white trim band (photo x 100–140) as it was.
  const keepingTrim = () =>
    fakeImage({
      paint: (init, mask, i, x, shade) => {
        const keep = mask[i] <= 127 || (x >= 100 && x < 140);
        return keep ? [0, 1, 2].map((k) => init.data[i * 3 + k]) : [136 * shade, 72 * shade, 66 * shade];
      },
    });

  async function run(compose) {
    const dir = tmp();
    const r = await aiRepaint({
      generate: keepingTrim().generate,
      photo: await photoPng(),
      mask: await rectMask(WALL),
      colorHex: "#AD2C34",
      surfaceLabel: "siding",
      outPath: join(dir, "out.png"),
      size: { width: 320, height: 240 },
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
    // the wall is photographed ~#e6e3dc where lit: say it is white paint now — a dimmer, warmer light
    const r = await aiRepaint({
      generate: fakeImage().generate,
      photo,
      mask: await rectMask(WALL),
      colorHex: "#AD2C34",
      colorName: "Positive Red",
      surfaceLabel: "siding",
      currentHex: "#ffffff",
      outPath: join(tmp(), "o.png"),
      size: { width: 320, height: 240 },
    });
    const s = r.surfaces[0];
    expect(s.gain.every((g) => g < 1)).toBe(true);
    expect(s.gain[0]).toBeGreaterThan(s.gain[2]); // the photo's wall is warmer than white
    expect(s.litHex).not.toBe("#ad2c34");
    expect(s.litMedian).toBe(s.litHex);
    expect(s.deltaE).toBeLessThan(0.5);
    // the same run without it locks to the chip
    const plain = await aiRepaint({
      generate: fakeImage().generate,
      photo,
      mask: await rectMask(WALL),
      colorHex: "#AD2C34",
      surfaceLabel: "siding",
      outPath: join(tmp(), "p.png"),
      size: { width: 320, height: 240 },
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

// The close-up (2026-10-28: on the website's house the model left the porch door as photographed — ΔE 37.8): a small
// part the first drawing left unpainted is drawn again from a crop around it, and kept only when it comes closer.
describe("the close-up: a small part the model left as photographed is drawn again", () => {
  const LEFT_WALL = [[0, 121, 400, 440]]; // the wall left of the door, so the door has no wall under it
  /** A fake whose first drawing repaints the wall and leaves the door (x ≥ 410) as it was; its later drawings
   *  (`closeUp`) repaint what their mask asks, or leave it too. */
  function doorSkipper({ closeUp = "repaint" } = {}) {
    const fake = fakeImage({
      paint: (init, mask, i, x, shade) => {
        const own = [init.data[i * 3], init.data[i * 3 + 1], init.data[i * 3 + 2]];
        if (mask[i] <= 127) return own.map((v) => v + 9);
        const left = fake.calls === 1 ? x >= 410 : closeUp === "leave";
        return left ? own : [136 * shade, 72 * shade, 66 * shade];
      },
    });
    return fake;
  }
  const run = async (fake, compose = {}) =>
    aiRepaint({
      generate: fake.generate,
      photo: await photoPng(),
      surfaces: [
        { mask: await rectMask(LEFT_WALL), colorHex: "#8a9a5b", colorName: "Sage", surfaceLabel: "siding" },
        { mask: await rectMask(DOOR), colorHex: "#a33a2f", colorName: "Brick Red", surfaceLabel: "front door" },
      ],
      outPath: join(tmp(), "o.png"),
      size: { width: 320, height: 240 },
      compose,
    });

  test("the door the first drawing left is drawn again from a crop around it, and comes out its paint", async () => {
    const fake = doorSkipper();
    const r = await run(fake);
    expect(fake.calls).toBe(2);
    // the close-up's request: the door alone, named alone, at a working size of its own (multiples of 16)
    expect(fake.seen.prompt).toContain("front door");
    expect(fake.seen.prompt).not.toContain("siding");
    expect(fake.seen.width % 16).toBe(0);
    expect(fake.seen.height % 16).toBe(0);
    // the crop grown to the first drawing's pixel budget (the door gets the model's whole canvas), its aspect kept
    expect(Math.abs(fake.seen.width * fake.seen.height - 320 * 240) / (320 * 240)).toBeLessThan(0.06);
    const { crop } = r.closeUp[0];
    expect(crop.width * crop.height).toBeLessThan(0.85 * 320 * 240);
    expect(fake.seen.width / fake.seen.height).toBeCloseTo(crop.width / crop.height, 1);
    expect(r.closeUp).toEqual([expect.objectContaining({ surfaceLabel: "front door", kept: true })]);
    expect(r.closeUp[0].before).toBeGreaterThanOrEqual(DEFAULT_COMPOSE.closeUpDeltaE);
    expect(r.surfaces[1].deltaE).toBeLessThan(1);
    expect(r.surfaces[0].deltaE).toBeLessThan(1); // the wall, untouched by the close-up
    expect(r.deltaE).toBeLessThan(1);
  });

  test("a close-up that leaves it too is not kept: the first picture and its ΔE stand", async () => {
    const fake = doorSkipper({ closeUp: "leave" });
    const r = await run(fake);
    expect(fake.calls).toBe(2);
    expect(r.closeUp[0]).toMatchObject({ surfaceLabel: "front door", kept: false });
    expect(r.surfaces[1].deltaE).toBe(r.closeUp[0].before);
  });

  test("a big part left as photographed gets no close-up (a crop wouldn't help it); the setting turns it off", async () => {
    // the wall is ~40% of the photo, past closeUpMaxShare
    const wallLeft = fakeImage({ paint: (init, mask, i) => [init.data[i * 3], init.data[i * 3 + 1], init.data[i * 3 + 2]] });
    const big = await aiRepaint({
      generate: wallLeft.generate,
      photo: await photoPng(),
      surfaces: [{ mask: await rectMask(LEFT_WALL), colorHex: "#2f3d4c", colorName: "Naval", surfaceLabel: "siding" }],
      outPath: join(tmp(), "o.png"),
      size: { width: 320, height: 240 },
    });
    expect(wallLeft.calls).toBe(1);
    expect(big.closeUp).toEqual([]);
    const off = doorSkipper();
    expect((await run(off, { closeUpMaxParts: 0 })).closeUp).toEqual([]);
    expect(off.calls).toBe(1);
  });
});
