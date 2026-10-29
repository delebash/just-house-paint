// SPDX-License-Identifier: MIT
// End to end on the real 3.4 GB SAM 3 bundle and a real photo, through the kit — gated: it needs SAM 3's files in the
// kit's models cache (the AI page's Vision tab, or the house page's banner, puts them there; an older install's move
// there at start).
//
//   HP_REAL_SAM3=1 HP_REAL_CACHE=<the kit's cache folder> npm run test:server -- tests/segment/real.test.js
//
// The kit's ONNX runtime builds SAM 3 with this app's adapter and holds it in memory, exactly as the app does
// (finder.js → the kit's runVisionFeature → withModel). HP_EP is the preset's executionProvider ("auto" · "cpu";
// default "auto"); HP_PHOTO the photo (default: the probe's house1, data/probe/ — gitignored, read only). Nothing is
// written.
import path from "node:path";
import * as hardware from "@delebash/core/runner/hardware";
import { RuntimeService } from "@delebash/core/runner/runtime_service";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ortBinDir, sam3Adapter } from "../../src/finder.js";
import { DEFAULT_PARTS, findParts } from "../../src/segment/parts.js";
import { maskToPng, pngToMask } from "../../src/segment/segmenter.js";
import { SAM3 } from "../../src/seed_presets.js";

const ON = process.env.HP_REAL_SAM3 === "1";
const CACHE = process.env.HP_REAL_CACHE || "";
// the probe folder in this checkout's data folder (gitignored): its photos — read only
const PROBE = path.resolve(import.meta.dirname, "../../../data/probe").replaceAll("\\", "/");
const EP = process.env.HP_EP ?? "auto";
const PHOTO = process.env.HP_PHOTO ?? `${PROBE}/photos/house1-white-shutters.jpg`;

/** The kit's ONNX runtime on the cache that holds SAM 3 (as installLlm makes it), the app's onnxruntime-node. */
const svc = ON
  ? new RuntimeService({
      id: "onnx",
      cacheRoot: CACHE,
      configFn: () => ({ idleSeconds: 0 }),
      modelsFn: () => [SAM3],
      ort: { load: () => import("onnxruntime-node"), binDir: ortBinDir() },
    })
  : null;

describe.skipIf(!ON)("SAM 3 on a real house photo, on the kit's ONNX runtime", () => {
  // the kit's hardware detection, as the app's boot runs it (installLlm): the arbiter books the card from it
  beforeAll(() => hardware.ensureDetected(), 120_000);
  afterAll(async () => {
    await svc?.stopServer();
  });

  it("findParts finds the garage door (score > 0.9) and a body by subtraction", { timeout: 600_000 }, async () => {
    expect(CACHE, "set HP_REAL_CACHE to the kit's cache folder").not.toBe("");
    await svc.withModel(SAM3.id, { adapter: sam3Adapter(), params: { executionProvider: EP } }, async (seg) => {
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
});
