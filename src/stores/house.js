// SPDX-License-Identifier: MIT
// The open house — what the house page shows and edits: its parts (and their masks), the colors on
// the screen, its saved designs and its AI photos. The server owns all of it (family rule 2); the
// colors on screen are a draft until saved as a design.
import { del, get, patch as patchJson, post, request } from "@delebash/ui";
import { defineStore } from "pinia";
import { runServerJob } from "../services/jobs.js";

const hp = (id, rest = "") => `/v1/houses/${encodeURIComponent(id)}${rest}`;

/**
 * A scheme's colors as { part: paintId } for the parts this house has. `roleParts` says which parts
 * each of the scheme's roles paints — the `schemes.roleParts` setting (Settings → General).
 */
export function schemeColors(scheme, partKeys, roleParts) {
  const have = new Set(partKeys);
  const out = {};
  for (const [role, parts] of Object.entries(roleParts)) {
    const id = scheme.roles?.[role]?.paint?.id;
    if (!id) continue;
    for (const key of parts) if (have.has(key)) out[key] = id;
  }
  return out;
}

const sameColors = (a, b) => {
  const ka = Object.keys(a).filter((k) => a[k]);
  const kb = Object.keys(b).filter((k) => b[k]);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};

export const useHouseStore = defineStore("house", {
  state: () => ({
    house: null,
    parts: [],
    designs: [],
    renders: [],
    loading: false,
    // { part: paintId } — what is painted on the screen now
    colors: {},
    // the design the colors came from (null: not from a saved design)
    designId: null,
    selectedPart: null,
    // bumps when a part's mask changes on the server (the mask URL's cache-buster)
    maskVersions: {},
    // a color read off the photo (the eyedropper, a part's color as photographed) for the Colors tab:
    // { hex, at } until the tab takes it
    pickedColor: null,
  }),
  getters: {
    design: (s) => s.designs.find((d) => d.id === s.designId) || null,
    /** The colors differ from the open design's (or there are colors and no design). */
    dirty() {
      const base = this.design?.colors || {};
      return !sameColors(this.colors, base);
    },
    paintableParts: (s) => s.parts.filter((p) => p.paintable && p.area > 0),
  },
  actions: {
    async open(id) {
      this.loading = true;
      try {
        const [house, parts, designs, renders] = await Promise.all([get(hp(id)), get(hp(id, "/parts")), get(hp(id, "/designs")), get(hp(id, "/renders"))]);
        Object.assign(this, { house, parts, designs, renders, colors: {}, designId: null, maskVersions: {}, pickedColor: null });
        this.selectedPart = this.paintableParts[0]?.key ?? null;
      } finally {
        this.loading = false;
      }
    },
    bumpMasks(keys) {
      const next = { ...this.maskVersions };
      for (const k of keys) next[k] = (next[k] || 0) + 1;
      this.maskVersions = next;
    },
    /** Find the parts (a server job on the task strip); `label` names it there. */
    async findParts(label) {
      await runServerJob({ start: () => post(hp(this.house.id, "/find-parts")), feature: "parts.find", label });
      const [house, parts] = await Promise.all([get(hp(this.house.id)), get(hp(this.house.id, "/parts"))]);
      this.house = house;
      this.parts = parts;
      this.bumpMasks(parts.map((p) => p.key));
      if (!parts.some((p) => p.key === this.selectedPart)) this.selectedPart = this.paintableParts[0]?.key ?? null;
    },
    /** What is inside a box (display pixels) joins the part (`add`) or leaves it (`remove`). */
    async box(key, box, mode = "add") {
      const r = await post(hp(this.house.id, `/parts/${encodeURIComponent(key)}/box`), { ...box, mode });
      this.parts = r.parts;
      this.bumpMasks(r.changed);
      return r.changed;
    },
    /** The brush's result for one part: a PNG Blob at the display size. */
    async saveMask(key, pngBlob) {
      // raw PNG bytes (the kit's put() would send JSON)
      const part = await request(hp(this.house.id, `/parts/${encodeURIComponent(key)}/mask`), { method: "PUT", headers: { "Content-Type": "image/png" }, body: pngBlob });
      this.parts = this.parts.map((p) => (p.key === key ? part : p));
      this.bumpMasks([key]);
      return part;
    },
    async addPart(key, paintable = true) {
      const part = await post(hp(this.house.id, "/parts"), { key, paintable });
      this.parts = [...this.parts, part];
      this.selectedPart = key;
      return part;
    },
    /** The colors on screen replaced whole (an Undo, a Redo). */
    setColors(colors) {
      this.colors = { ...colors };
    },
    /** Reset (a): every paint taken off — the photo as taken. */
    clearColors() {
      this.colors = {};
    },
    /** Reset (b): back to the open design's saved colors. */
    revertToDesign() {
      if (this.design) this.colors = { ...this.design.colors };
    },
    /** A color read off the photo, for the Colors tab to match to paints. */
    pickColor(hex) {
      this.pickedColor = { hex, at: Date.now() };
    },
    /** The picked color, once — the Colors tab takes it. */
    takePickedColor() {
      const p = this.pickedColor;
      this.pickedColor = null;
      return p;
    },
    setColor(part, paintId) {
      const next = { ...this.colors };
      if (paintId) next[part] = paintId;
      else delete next[part];
      this.colors = next;
    },
    applyScheme(scheme, roleParts) {
      this.colors = { ...this.colors, ...schemeColors(scheme, this.paintableParts.map((p) => p.key), roleParts) };
    },
    openDesign(id) {
      const d = this.designs.find((x) => x.id === id);
      if (!d) return;
      this.designId = id;
      this.colors = { ...d.colors };
    },
    async saveDesignAs(name) {
      const d = await post(hp(this.house.id, "/designs"), { name, colors: this.colors });
      this.designs = [...this.designs, d];
      this.designId = d.id;
      return d;
    },
    async saveDesign() {
      const d = await patchJson(`/v1/designs/${encodeURIComponent(this.designId)}`, { colors: this.colors });
      this.designs = this.designs.map((x) => (x.id === d.id ? d : x));
      return d;
    },
    async renameDesign(id, name) {
      const d = await patchJson(`/v1/designs/${encodeURIComponent(id)}`, { name });
      this.designs = this.designs.map((x) => (x.id === d.id ? d : x));
      return d;
    },
    async deleteDesign(id) {
      await del(`/v1/designs/${encodeURIComponent(id)}`);
      this.designs = this.designs.filter((x) => x.id !== id);
      if (this.designId === id) this.designId = null;
    },
    /** An AI photo of the colors on screen (a server job). Resolves with the kept render. */
    async aiPhoto(label) {
      const render = await runServerJob({ start: () => post(hp(this.house.id, "/aiphoto"), { colors: this.colors }), feature: "aiphoto.render", label });
      this.renders = [render, ...this.renders];
      return render;
    },
    async deleteRender(id) {
      await del(`/v1/renders/${encodeURIComponent(id)}`);
      this.renders = this.renders.filter((r) => r.id !== id);
    },
  },
});
