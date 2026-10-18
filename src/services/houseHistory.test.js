// SPDX-License-Identifier: MIT
// The house page's Undo / Redo over VueUse's history: colors and outlines recorded, put back in
// order, a redo dropped by a new change, an Undo's own color change never recorded twice.
import { describe, expect, test } from "vitest";
import { useHouseHistory } from "./houseHistory.js";

function harness() {
  const applied = [];
  const h = useHouseHistory({
    apply: async (rec, prev) => {
      applied.push({ colors: rec.colors, changedMasks: Object.keys(rec.masks).filter((k) => rec.masks[k] !== prev.masks[k]) });
    },
  });
  return { h, applied };
}

describe("useHouseHistory", () => {
  test("colors: undo and redo walk the records, and a new change drops the redo", async () => {
    const { h, applied } = harness();
    h.reset({ colors: {}, masks: { body: "m0" } });
    expect(h.canUndo.value).toBe(false);
    h.record({ colors: { body: "p:1" } });
    h.record({ colors: { body: "p:1", trim: "p:2" } });
    expect(h.canUndo.value).toBe(true);

    await h.undo();
    expect(applied.at(-1).colors).toEqual({ body: "p:1" });
    await h.undo();
    expect(applied.at(-1).colors).toEqual({});
    expect(h.canUndo.value).toBe(false);
    await h.redo();
    expect(applied.at(-1).colors).toEqual({ body: "p:1" });
    expect(h.canRedo.value).toBe(true);

    h.record({ colors: { body: "p:9" } });
    expect(h.canRedo.value).toBe(false);
  });

  test("an outline change records its Blob; undo names the outline that changed back", async () => {
    const { h, applied } = harness();
    h.reset({ colors: { body: "p:1" }, masks: { body: "m0", trim: "t0" } });
    h.record({ masks: { trim: "t1" } });
    await h.undo();
    expect(applied.at(-1).changedMasks).toEqual(["trim"]);
    expect(h.current().masks).toEqual({ body: "m0", trim: "t0" });
    expect(h.current().colors).toEqual({ body: "p:1" });
  });

  test("the same colors again — an Undo's own change coming back through the page — record nothing", () => {
    const { h } = harness();
    h.reset({ colors: { body: "p:1" } });
    h.record({ colors: { body: "p:1" } });
    expect(h.canUndo.value).toBe(false);
  });

  test("reset starts over", () => {
    const { h } = harness();
    h.reset({});
    h.record({ colors: { body: "p:1" } });
    h.reset({ colors: { body: "p:1" } });
    expect(h.canUndo.value).toBe(false);
    expect(h.canRedo.value).toBe(false);
  });
});
