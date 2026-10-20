// SPDX-License-Identifier: MIT
// The house page's Undo / Redo (Ctrl+Z, Ctrl+Y) — VueUse's useManualRefHistory (vueuse.org/core/
// useManualRefHistory) over one record: the colors on screen, the design they belong to and the design's
// colors they started from (the merge base a save diffs against — stores/house.js), and every part's outline as
// a PNG Blob.
// A Blob is shared, never copied, so a record costs only what changed: a brush stroke adds one PNG,
// a color change nothing but the colors. Undo and Redo hand the record back to `apply(record,
// previous)` — the page repaints and saves the outlines that changed (the server owns them).
import { useManualRefHistory } from "@vueuse/core";
import { shallowRef } from "vue";

const sameColors = (a, b) => {
  const ka = Object.keys(a).filter((k) => a[k]);
  const kb = Object.keys(b).filter((k) => b[k]);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};

export function useHouseHistory({ apply, capacity = 50 }) {
  const state = shallowRef({ colors: {}, designId: null, designBase: null, masks: {} });
  const history = useManualRefHistory(state, {
    capacity,
    clone: (v) => ({ colors: { ...v.colors }, designId: v.designId, designBase: v.designBase, masks: { ...v.masks } }),
  });
  let moving = false;

  /** Undo or Redo: move, then let the page put the record back. One at a time. */
  async function step(move, can) {
    if (moving || !can.value) return;
    moving = true;
    try {
      const before = state.value;
      move();
      await apply(state.value, before);
    } finally {
      moving = false;
    }
  }

  return {
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    /** Start over from this record — a house opened, its parts found again. */
    reset({ colors = {}, designId = null, designBase = null, masks = {} } = {}) {
      state.value = { colors: { ...colors }, designId, designBase, masks: { ...masks } };
      // commit makes this the history's current record (VueUse keeps it apart from the stacks),
      // clear then drops what came before — without the commit, the first Undo went back to the
      // record from before the reset
      history.commit();
      history.clear();
    },
    /** A change to record: new colors (with the design they belong to), or the outlines that changed
     *  ({ key: Blob }). Colors and design equal to the current record (an Undo putting colors back)
     *  record nothing. */
    record({ colors, designId, designBase, masks } = {}) {
      if (moving) return;
      const next = {
        colors: colors ?? state.value.colors,
        designId: designId === undefined ? state.value.designId : designId,
        designBase: designBase === undefined ? state.value.designBase : designBase,
        masks: masks ? { ...state.value.masks, ...masks } : state.value.masks,
      };
      if (!masks && sameColors(next.colors, state.value.colors) && next.designId === state.value.designId) return;
      state.value = next;
      history.commit();
    },
    /** The open design changed without the colors changing (saved as a new one, deleted): the current
     *  record says so, as no new step — Undo then never reopens a design the colors don't belong to. */
    amendDesign(designId, designBase = state.value.designBase) {
      if (moving) return;
      state.value = { ...state.value, designId, designBase };
      const last = history.last.value;
      if (last?.snapshot) Object.assign(last.snapshot, { designId, designBase });
    },
    undo: () => step(history.undo, history.canUndo),
    redo: () => step(history.redo, history.canRedo),
    /** The current record (the page's outlines as Blobs). */
    current: () => state.value,
  };
}
