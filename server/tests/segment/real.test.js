// SPDX-License-Identifier: MIT
// End to end on the real 3.4 GB SAM 3 bundle and a real photo. Off unless HP_REAL_SAM3=1.
//   HP_SAM3_DIR       the bundle (default: the probe's copy)
//   HP_TOKENIZER_DIR  CLIP tokenizer.json + tokenizer_config.json (default: HP_SAM3_DIR, else the probe's)
//   HP_PHOTO          the photo (default: the probe's house1)
//   HP_EP             executionProvider: a name or per-model JSON (default "auto")
import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_PARTS, findParts } from "../../src/segment/parts.js";
import { createSegmenter, maskToPng, pngToMask } from "../../src/segment/segmenter.js";

const ON = process.env.HP_REAL_SAM3 === "1";
// the probe folder in this checkout's data folder (gitignored): its photos and models
const PROBE = path.resolve(import.meta.dirname, "../../../data/probe").replaceAll("\\", "/");
const MODEL_DIR = process.env.HP_SAM3_DIR ?? `${PROBE}/models/sam3-onnx`;
const TOKENIZER_DIR =
  process.env.HP_TOKENIZER_DIR ??
  (existsSync(path.join(MODEL_DIR, "tokenizer.json"))
    ? MODEL_DIR
    : "C:/Users/danel/AppData/Local/Temp/claude/E--Dev-Web/e638ccef-5272-43ac-aac9-5a06611adc13/scratchpad/tokenizer-clip");
const EP = process.env.HP_EP?.startsWith("{") ? JSON.parse(process.env.HP_EP) : (process.env.HP_EP ?? "auto");
const PHOTO = process.env.HP_PHOTO ?? `${PROBE}/photos/house1-white-shutters.jpg`;

describe.skipIf(!ON)("SAM 3 on a real house photo", () => {
  let seg;
  afterAll(async () => {
    await seg?.dispose();
  });

  it("findParts finds the garage door (score > 0.9) and a body by subtraction", { timeout: 600_000 }, async () => {
    seg = await createSegmenter({ modelDir: MODEL_DIR, tokenizerDir: TOKENIZER_DIR, executionProvider: EP, log: console });
    const handle = await seg.encode(PHOTO);
    expect(handle.width).toBeGreaterThan(0);
    const r = await findParts(seg, handle, DEFAULT_PARTS);
    const byKey = Object.fromEntries(r.parts.map((p) => [p.key, p]));
    console.log(
      `providers ${JSON.stringify(Object.fromEntries(Object.entries(seg.providers).map(([k, v]) => [k, v.ep])))} · encode ${Math.round(handle.encodeMs)} ms · findParts ${r.timings.totalMs} ms\n` +
        r.parts.map((p) => `  ${p.key.padEnd(10)} ${p.instances.length} × · score ${p.score.toFixed(3)} · ${p.area} px`).join("\n"),
    );
    expect(byKey.garageDoor.score).toBeGreaterThan(0.9);
    expect(byKey.garageDoor.area).toBeGreaterThan(50_000);
    expect(byKey.body.area).toBeGreaterThan(0);
    // the body never overlaps another found part
    for (const p of r.parts) {
      if (p.key === "body" || !p.mask) continue;
      for (let i = 0; i < p.mask.length; i += 97) if (p.mask[i]) expect(byKey.body.mask[i]).toBe(0);
    }
    // the mask survives a PNG round trip
    const back = await pngToMask(await maskToPng(byKey.garageDoor.mask, r.width, r.height));
    expect(Buffer.compare(Buffer.from(back.mask), Buffer.from(byKey.garageDoor.mask))).toBe(0);
    seg.release(handle);
  });
});
