// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { maskArea } from "../../src/segment/masks.js";
import DEFAULT_PARTS_DEFAULT, { DEFAULT_PARTS, findParts, pickMainInstance, validatePartsConfig } from "../../src/segment/parts.js";

const W = 40;
const H = 30;
const rect = (x0, y0, x1, y1) => {
  const m = new Uint8Array(W * H);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 255;
  return m;
};
const inst = (score, box) => ({ score, box, mask: rect(...box), area: (box[2] - box[0]) * (box[3] - box[1]) });

/** A segmenter that answers from a table: phrase → instances. */
function fakeSegmenter(table) {
  const calls = [];
  return {
    calls,
    async findText(_handle, phrase, opts) {
      calls.push({ phrase, threshold: opts?.threshold });
      return (table[phrase] ?? []).map((i) => ({ ...i }));
    },
  };
}
const handle = { id: 1, width: W, height: H };

describe("the parts config", () => {
  it("DEFAULT_PARTS is valid, frozen, and the default export", () => {
    expect(DEFAULT_PARTS_DEFAULT).toBe(DEFAULT_PARTS);
    expect(() => validatePartsConfig(DEFAULT_PARTS)).not.toThrow();
    expect(Object.isFrozen(DEFAULT_PARTS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PARTS[0])).toBe(true);
    const keys = DEFAULT_PARTS.map((p) => p.key);
    for (const k of ["body", "trim", "frontDoor", "garageDoor", "shutters", "columns", "railings", "gutters", "soffit", "windowTrim", "chimney", "decor"]) {
      expect(DEFAULT_PARTS.find((p) => p.key === k).paintable).toBe(true);
    }
    for (const k of ["roof", "windows", "stone", "brick", "lamps"]) expect(DEFAULT_PARTS.find((p) => p.key === k).paintable).toBe(false);
    expect(keys.length).toBe(17);
    // the window casings are their own part, not the trim's; the doors' casings are the trim's
    const trim = DEFAULT_PARTS.find((p) => p.key === "trim");
    expect(trim.prompts).not.toContain("window trim");
    expect(trim.prompts).toEqual(expect.arrayContaining(["garage door frame", "door frame"]));
    // the words that also find things beside the house are held to it (RESEARCH §13)
    expect(trim.onHouse).toBe(0.15);
    expect(DEFAULT_PARTS.find((p) => p.key === "decor").onHouse).toBe(0.5);
    expect(DEFAULT_PARTS.filter((p) => p.method === "subtract").map((p) => p.key)).toEqual(["body"]);
  });

  it("fills threshold 0.5 and method text when absent", () => {
    const [p] = validatePartsConfig([{ key: "a", labelKey: "x.a", prompts: ["door"], paintable: true, group: "doors" }]);
    expect(p.threshold).toBe(0.5);
    expect(p.method).toBe("text");
  });

  const good = { key: "a", labelKey: "x.a", prompts: ["door"], threshold: 0.5, paintable: true, group: "doors" };
  it.each([
    [[], /non-empty array/],
    ["nope", /non-empty array/],
    [[null], /must be an object/],
    [[{ ...good, key: "" }], /key/],
    [[good, { ...good }], /duplicate key/],
    [[{ ...good, labelKey: 3 }], /labelKey/],
    [[{ ...good, prompts: [] }], /prompts/],
    [[{ ...good, prompts: ["ok", " "] }], /every prompt/],
    [[{ ...good, threshold: 1 }], /threshold/],
    [[{ ...good, threshold: "0.5" }], /threshold/],
    [[{ ...good, paintable: "yes" }], /paintable/],
    [[{ ...good, group: "" }], /group/],
    [[{ ...good, method: "magic" }], /method/],
    [[{ ...good, method: "subtract" }, { ...good, key: "b", method: "subtract" }], /only one part/],
  ])("rejects %j", (config, why) => {
    expect(() => validatePartsConfig(config)).toThrow(why);
  });
});

describe("the main house", () => {
  it("picks the big central house over a neighbor at the edge", () => {
    const main = inst(0.8, [10, 5, 32, 28]);
    const neighbor = inst(0.9, [0, 0, 9, 30]);
    expect(pickMainInstance([neighbor, main], W, H)).toBe(main);
  });

  it("a central house beats a slightly bigger one cut off at the edge", () => {
    const central = inst(0.7, [12, 6, 30, 24]); // 324 px at the centre
    const edge = inst(0.9, [20, 0, 40, 18]); // 360 px, off-centre
    expect(pickMainInstance([edge, central], W, H)).toBe(central);
  });

  it("none or empty masks → null", () => {
    expect(pickMainInstance([], W, H)).toBeNull();
    expect(pickMainInstance([{ mask: new Uint8Array(W * H) }], W, H)).toBeNull();
  });
});

describe("findParts", () => {
  const config = [
    { key: "body", labelKey: "p.body", prompts: ["house"], threshold: 0.5, paintable: true, group: "walls", method: "subtract" },
    { key: "door", labelKey: "p.door", prompts: ["door", "front door"], threshold: 0.6, paintable: true, group: "doors" },
    { key: "roof", labelKey: "p.roof", prompts: ["roof"], threshold: 0.5, paintable: false, group: "roof" },
    { key: "shutters", labelKey: "p.shutters", prompts: ["shutter"], threshold: 0.5, paintable: true, group: "accents" },
  ];
  const table = {
    house: [inst(0.9, [0, 0, 8, 30]), inst(0.85, [10, 4, 34, 28])], // neighbor first, main second
    door: [inst(0.9, [18, 18, 22, 28])],
    "front door": [inst(0.95, [18, 18, 22, 27])], // the same door → de-duplicated
    roof: [inst(0.97, [10, 4, 34, 10])],
  };

  it("body = the main house minus every other part; neighbor ignored", async () => {
    const seg = fakeSegmenter(table);
    const r = await findParts(seg, handle, config);
    expect(r.width).toBe(W);
    expect(r.parts.map((p) => p.key)).toEqual(["body", "door", "roof", "shutters"]);
    const body = r.parts[0];
    const house = 24 * 24;
    const roof = 24 * 6;
    const door = 4 * 9; // the kept "front door" instance
    expect(body.area).toBe(house - roof - door);
    expect(body.score).toBe(0.85);
    expect(body.instances).toHaveLength(1);
    expect(body.mask[5 * W + 3]).toBe(0); // the neighbor's pixels are not body
    expect(body.mask[20 * W + 12]).toBe(255);
    expect(body.mask[20 * W + 19]).toBe(0); // door cut out
    expect(maskArea(body.mask)).toBe(body.area);
  });

  it("a part's prompts are merged and de-duplicated; each prompt uses the part's threshold", async () => {
    const seg = fakeSegmenter(table);
    const r = await findParts(seg, handle, config);
    const door = r.parts[1];
    expect(door.instances).toHaveLength(1);
    expect(door.instances[0].prompt).toBe("front door");
    expect(door.score).toBe(0.95);
    expect(door.area).toBe(4 * 9); // the kept instance only
    expect(seg.calls.filter((c) => c.phrase.includes("door")).map((c) => c.threshold)).toEqual([0.6, 0.6]);
  });

  it("parts with nothing found come back empty, in config order", async () => {
    const r = await findParts(fakeSegmenter(table), handle, config);
    expect(r.parts[3]).toEqual({ key: "shutters", mask: null, area: 0, score: 0, instances: [] });
  });

  it("no house found → empty body", async () => {
    const r = await findParts(fakeSegmenter({ ...table, house: [] }), handle, config);
    expect(r.parts[0]).toMatchObject({ key: "body", mask: null, area: 0 });
  });

  it("reports timings and progress, and stops on abort", async () => {
    const progress = [];
    const r = await findParts(fakeSegmenter(table), handle, config, { onProgress: (p) => progress.push(p) });
    expect(r.timings.prompts.map((p) => p.phrase)).toEqual(["house", "door", "front door", "roof", "shutter"]);
    expect(r.timings.prompts[0]).toMatchObject({ part: "body", found: 2 });
    expect(typeof r.timings.totalMs).toBe("number");
    expect(progress.map((p) => p.index)).toEqual([0, 1, 2, 3, 4]);
    expect(progress[0].total).toBe(5);

    const ctl = new AbortController();
    const seg = fakeSegmenter(table);
    const p = findParts(seg, handle, config, {
      onProgress: ({ index }) => {
        if (index === 1) ctl.abort();
      },
      signal: ctl.signal,
    });
    await expect(p).rejects.toThrow();
    expect(seg.calls.length).toBe(2);
  });

  it("validates the config before running anything", async () => {
    const seg = fakeSegmenter(table);
    await expect(findParts(seg, handle, [{ key: "x" }])).rejects.toThrow(TypeError);
    expect(seg.calls).toHaveLength(0);
  });
});

describe("a part with others taken out (minus)", () => {
  it("window trim is the window's outline minus its glass; the glass is the windows part", async () => {
    // a window 10×10 at (5,5); its glass the 6×6 inside; "window trim" finds the same window again
    const seg = fakeSegmenter({
      "window glass": [inst(0.7, [7, 7, 13, 13])],
      window: [inst(0.9, [5, 5, 15, 15])],
      "window trim": [inst(0.6, [5, 5, 15, 15])],
    });
    const config = [
      { key: "windows", labelKey: "w", prompts: ["window glass"], threshold: 0.3, paintable: false, group: "windows" },
      { key: "windowTrim", labelKey: "t", prompts: ["window", "window trim"], paintable: true, group: "trim", minus: ["windows"] },
    ];
    const r = await findParts(seg, handle, config);
    expect(r.parts.find((p) => p.key === "windows").area).toBe(36);
    const trim = r.parts.find((p) => p.key === "windowTrim");
    expect(trim.area).toBe(100 - 36); // the frame ring
    expect(trim.mask[10 * W + 10]).toBe(0); // the middle is glass
    expect(trim.mask[5 * W + 5]).toBe(255); // a corner is frame
  });

  it("a part all glass leaves nothing; minus must name a part in the list, not itself, on a text part", () => {
    const good = { key: "a", labelKey: "x.a", prompts: ["door"], paintable: true, group: "doors" };
    expect(() => validatePartsConfig([{ ...good, minus: ["b"] }])).toThrow(/isn't in the list/);
    expect(() => validatePartsConfig([{ ...good, minus: ["a"] }])).toThrow(/itself/);
    expect(() => validatePartsConfig([{ ...good, method: "subtract", minus: ["b"] }, { ...good, key: "b" }])).toThrow(/only a "text" part/);
    expect(validatePartsConfig([{ ...good }])[0].minus).toEqual([]);
  });

  it("onHouse is a share from 0 to 1, on a text part; 0 when absent", () => {
    const good = { key: "a", labelKey: "x.a", prompts: ["door"], paintable: true, group: "doors" };
    expect(validatePartsConfig([{ ...good }])[0].onHouse).toBe(0);
    expect(validatePartsConfig([{ ...good, onHouse: 0.5 }])[0].onHouse).toBe(0.5);
    for (const bad of [-0.1, 1.5, "0.5"]) expect(() => validatePartsConfig([{ ...good, onHouse: bad }])).toThrow(/onHouse/);
    expect(() => validatePartsConfig([{ ...good, method: "subtract", onHouse: 0.5 }])).toThrow(/only a "text" part is held to onHouse/);
  });
});

describe("parts stay on the house", () => {
  it("a part found outside the house (a car's door) is clipped away; one on its outline is kept", async () => {
    // the house: x 0–20; a real door on it; a "door" on a car at x 30–38; trim just past the house's edge
    const seg = fakeSegmenter({
      house: [inst(0.9, [0, 0, 20, 30])],
      door: [inst(0.9, [5, 10, 10, 30]), inst(0.8, [30, 10, 38, 30])],
      trim: [inst(0.8, [20, 0, 21, 30])],
    });
    const config = [
      { key: "body", labelKey: "b", prompts: ["house"], paintable: true, group: "walls", method: "subtract" },
      { key: "frontDoor", labelKey: "d", prompts: ["door"], paintable: true, group: "doors" },
      { key: "trim", labelKey: "t", prompts: ["trim"], paintable: true, group: "trim" },
    ];
    const free = await findParts(seg, handle, config);
    expect(free.parts.find((p) => p.key === "frontDoor").area).toBe(5 * 20 + 8 * 20); // both doors
    const clipped = await findParts(seg, handle, config, { houseMargin: 0.05 }); // 2 px of 40
    expect(clipped.parts.find((p) => p.key === "frontDoor").area).toBe(5 * 20); // the car's door is gone
    expect(clipped.parts.find((p) => p.key === "trim").area).toBe(30); // within the margin: kept
  });

  it("a piece mostly off the house is dropped whole, even where it touches the house", async () => {
    // a car door that starts just inside the house's grown outline (x 19–30): only part of it is on
    const seg = fakeSegmenter({
      house: [inst(0.9, [0, 0, 20, 30])],
      door: [inst(0.9, [5, 10, 10, 30]), inst(0.8, [19, 10, 30, 30])],
    });
    const config = [
      { key: "body", labelKey: "b", prompts: ["house"], paintable: true, group: "walls", method: "subtract" },
      { key: "frontDoor", labelKey: "d", prompts: ["door"], paintable: true, group: "doors" },
    ];
    const r = await findParts(seg, handle, config, { houseMargin: 0.05, houseMinShare: 0.5 });
    const door = r.parts.find((p) => p.key === "frontDoor");
    expect(door.area).toBe(5 * 20); // only the house's own door
    expect(door.instances).toHaveLength(1);
  });

  it("a neighbor's house across the yard isn't the house; a wing touching it is", async () => {
    // the main house x 8–24 (central, biggest); its garage wing x 24–30 touching it; a neighbor's house
    // x 34–40, 4 px away (more than the 2 px margin) — each with a door
    const seg = fakeSegmenter({
      house: [inst(0.9, [8, 0, 24, 30]), inst(0.8, [24, 10, 30, 30]), inst(0.8, [34, 5, 40, 30])],
      door: [inst(0.9, [12, 15, 16, 30]), inst(0.9, [25, 20, 29, 30]), inst(0.9, [35, 20, 38, 30])],
    });
    const config = [
      { key: "body", labelKey: "b", prompts: ["house"], paintable: true, group: "walls", method: "subtract" },
      { key: "frontDoor", labelKey: "d", prompts: ["door"], paintable: true, group: "doors" },
    ];
    const r = await findParts(seg, handle, config, { houseMargin: 0.05, houseMinShare: 0.5 }); // 2 px of 40
    const door = r.parts.find((p) => p.key === "frontDoor");
    expect(door.instances).toHaveLength(2); // the house's and the wing's, not the neighbor's
    expect(door.area).toBe(4 * 15 + 4 * 10);
  });

  it("a part held to onHouse keeps only pieces that much on the house itself, whatever the margin keeps", async () => {
    // the house: x 0–20. A medallion on the wall; a statue just in front of it (x 21–23, inside the
    // margin); a corner board half off the house's outline (x 18–22: 2 of its 4 columns on the house)
    const seg = fakeSegmenter({
      house: [inst(0.9, [0, 0, 20, 30])],
      decoration: [inst(0.6, [8, 2, 12, 6]), inst(0.6, [21, 20, 23, 30])],
      trim: [inst(0.8, [18, 0, 22, 30])],
    });
    const config = [
      { key: "body", labelKey: "b", prompts: ["house"], paintable: true, group: "walls", method: "subtract" },
      { key: "decor", labelKey: "d", prompts: ["decoration"], paintable: true, group: "trim", onHouse: 0.5 },
      { key: "trim", labelKey: "t", prompts: ["trim"], paintable: true, group: "trim", onHouse: 0.15 },
    ];
    const r = await findParts(seg, handle, config, { houseMargin: 0.1, houseMinShare: 0.5 }); // 4 px of 40
    const decor = r.parts.find((p) => p.key === "decor");
    expect(decor.instances).toHaveLength(1); // the medallion; the statue is off the house itself
    expect(decor.area).toBe(16);
    expect(r.parts.find((p) => p.key === "trim").area).toBe(4 * 30); // half on the house: kept whole
    // the same statue with no onHouse: the margin alone keeps it
    const loose = await findParts(seg, handle, config.map((p) => ({ ...p, onHouse: 0 })), { houseMargin: 0.1, houseMinShare: 0.5 });
    expect(loose.parts.find((p) => p.key === "decor").instances).toHaveLength(2);
  });
});
