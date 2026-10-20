// SPDX-License-Identifier: MIT
// The open house — what the house page shows and edits: its parts (and their masks), the colors on
// the screen, its saved designs and its AI photos. The server owns all of it (family rule 2); the
// colors on screen are a draft until saved as a design.
//
// Other windows change the same house (services/otherWindows.js): a design is saved as the parts this
// window changed (JSON Merge Patch — another window's parts stay), and an outline write carries the
// outlines' version the page holds (If-Match, the server's outlines.js) — one made on outlines another
// window changed since is refused (412) and the page reads them again.
import { del, get, patch as patchJson, post, request } from "@delebash/ui";
import { defineStore } from "pinia";
import { runServerJob } from "../services/jobs.js";

const hp = (id, rest = "") => `/v1/houses/${encodeURIComponent(id)}${rest}`;

// the latest open() — an earlier one that answers later is dropped
let openSeq = 0;

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

/**
 * A design's trim-group parts this house has that the design gives no color, when the design colors
 * the trim: { parts: [key…], paintId: the trim's paint } or null. A design saved before the house
 * had a part (soffits, window trim) leaves it unpainted; it can't tell that part from one left
 * unpainted on purpose, so this is only offered (the Designs tab), never painted unasked.
 */
export function unpaintedTrim(colors, partKeys, roleParts) {
  const paintId = colors.trim;
  if (!paintId) return null;
  const have = new Set(partKeys);
  const parts = (roleParts?.trim || []).filter((key) => have.has(key) && !colors[key]);
  return parts.length ? { parts, paintId } : null;
}

/** What turns colors `from` into `to`, as a JSON Merge Patch (RFC 7396): the parts that differ, null for a
 *  part `to` leaves unpainted. */
export function colorsPatch(from, to) {
  const out = {};
  for (const k of new Set([...Object.keys(from || {}), ...Object.keys(to || {})])) {
    if ((from?.[k] || null) !== (to?.[k] || null)) out[k] = to?.[k] || null;
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
    // the version of the outlines the page holds (the server's ETag): an outline write sends it (If-Match).
    // The page takes a new one only once it has the outlines that go with it (useOutlines), or from the
    // answer to its own write
    outlinesVersion: null,
    // a color read off the photo (the eyedropper, a part's color as photographed) for the Colors tab:
    // { hex, at } until the tab takes it
    pickedColor: null,
    // the open design's trim-group parts with no color, offered on the Designs tab (unpaintedTrim):
    // { parts, paintId } until painted, dismissed or another design is opened
    trimOffer: null,
  }),
  getters: {
    design: (s) => s.designs.find((d) => d.id === s.designId) || null,
    /** The colors differ from the open design's (or there are colors and no design). */
    dirty() {
      const base = this.design?.colors || {};
      return !sameColors(this.colors, base);
    },
    paintableParts: (s) => s.parts.filter((p) => p.paintable && p.area > 0),
    /** The trim offer's parts still without a color on screen — one painted by hand drops out. None
     *  once the offer is stale: its design isn't the open one any more (deleted, another opened, saved
     *  as a new one), or the trim on screen isn't the color it would paint (Reset, a new trim). */
    trimOfferParts: (s) => {
      const o = s.trimOffer;
      if (!o || s.designId !== o.designId || s.colors.trim !== o.paintId) return [];
      return o.parts.filter((key) => !s.colors[key]);
    },
  },
  actions: {
    async open(id) {
      const seq = ++openSeq;
      this.loading = true;
      // another house: nothing of the last one shows (or is acted on) while this one loads
      if (this.house?.id !== id) Object.assign(this, { house: null, parts: [], designs: [], renders: [] });
      try {
        const [house, parts, designs, renders] = await Promise.all([get(hp(id)), get(hp(id, "/parts")), get(hp(id, "/designs")), get(hp(id, "/renders"))]);
        if (seq !== openSeq) return;
        Object.assign(this, { house, parts, designs, renders, colors: {}, designId: null, maskVersions: {}, pickedColor: null, trimOffer: null, outlinesVersion: null });
        this.selectedPart = this.paintableParts[0]?.key ?? null;
      } finally {
        this.loading = false;
      }
    },
    /** What the server has of the open house now — another window changed it: the house, its parts, designs
     *  and AI photos read again; the colors on screen stay (this window's draft), the open design's id goes if
     *  it was deleted. `outlinesChanged`: the outlines aren't the ones the page holds (it reads them again,
     *  then useOutlines). */
    async refresh() {
      const id = this.house.id;
      const [house, parts, designs, renders] = await Promise.all([get(hp(id)), get(hp(id, "/parts")), get(hp(id, "/designs")), get(hp(id, "/renders"))]);
      if (this.house?.id !== id) return { outlinesChanged: false };
      const outlinesChanged = house.outlines !== this.outlinesVersion;
      Object.assign(this, { house, parts, designs, renders });
      if (outlinesChanged) this.bumpMasks(parts.map((p) => p.key));
      if (this.designId && !designs.some((d) => d.id === this.designId)) this.designId = null;
      if (!parts.some((p) => p.key === this.selectedPart)) this.selectedPart = this.paintableParts[0]?.key ?? null;
      return { outlinesChanged };
    },
    /** The house's designs read again (one deleted in another window). */
    async refreshDesigns() {
      const id = this.house.id;
      const designs = await get(hp(id, "/designs"));
      if (this.house?.id !== id) return;
      this.designs = designs;
      if (this.designId && !designs.some((d) => d.id === this.designId)) this.designId = null;
    },
    /** The page has the outlines of version `v` (read after it): its writes send it from now on. */
    useOutlines(v) {
      this.outlinesVersion = v;
    },
    /** The If-Match an outline write sends (none until the page holds outlines). */
    ifMatch() {
      return this.outlinesVersion ? { "If-Match": this.outlinesVersion } : {};
    },
    bumpMasks(keys) {
      const next = { ...this.maskVersions };
      for (const k of keys) next[k] = (next[k] || 0) + 1;
      this.maskVersions = next;
    },
    /** This house's jobs running on the server now (finding its parts, an AI photo) — started before the
     *  window reloaded, or in another window: [job snapshot…], as `GET /v1/jobs/:id` answers each. */
    runningJobs(id = this.house.id) {
      return get(hp(id, "/jobs"));
    },
    /** Find the parts (a server job on the task strip); `label` names it there. */
    /** `describe(job, percent)` words its progress (the part being found) — see services/jobs.js;
     *  `keepEdited` keeps the parts changed by hand as they are (the found ones are cut around them);
     *  `job`: a run already going (runningJobs) to follow instead of starting one. */
    async findParts(label, describe, { keepEdited = false, job = null } = {}) {
      const id = this.house.id;
      // keeping the hand edits was asked from the parts this page holds: refused if another window changed them
      const start = job ? async () => job : () => post(hp(id, "/find-parts"), { keepEdited }, { headers: this.ifMatch() });
      await runServerJob({ start, feature: "parts.find", label, meta: { houseId: id }, describe });
      // another house opened meanwhile: this one's parts are on the server, read when it opens again
      if (this.house?.id !== id) return;
      const [house, parts] = await Promise.all([get(hp(id)), get(hp(id, "/parts"))]);
      if (this.house?.id !== id) return;
      this.house = house;
      this.parts = parts;
      this.bumpMasks(parts.map((p) => p.key));
      if (!parts.some((p) => p.key === this.selectedPart)) this.selectedPart = this.paintableParts[0]?.key ?? null;
    },
    /** What is inside a box (display pixels) joins the part (`add`) or leaves it (`remove`). */
    async box(key, box, mode = "add") {
      const id = this.house.id;
      const r = await post(hp(id, `/parts/${encodeURIComponent(key)}/box`), { ...box, mode }, { headers: this.ifMatch() });
      if (this.house?.id !== id) return [];
      this.parts = r.parts;
      this.bumpMasks(r.changed);
      // the page holds the box's result once it has read the changed outlines — it was current before (If-Match)
      this.outlinesVersion = r.outlines;
      return r.changed;
    },
    /** The brush's result for one part: a PNG Blob at the display size, saved to `houseId` — the house
     *  it was drawn on (a save can run after the page left it). */
    async saveMask(key, pngBlob, houseId = this.house.id) {
      // raw PNG bytes (the kit's put() would send JSON)
      const headers = { "Content-Type": "image/png", ...(this.house?.id === houseId ? this.ifMatch() : {}) };
      const { outlines, ...part } = await request(hp(houseId, `/parts/${encodeURIComponent(key)}/mask`), { method: "PUT", headers, body: pngBlob });
      if (this.house?.id !== houseId) return part;
      this.parts = this.parts.map((p) => (p.key === key ? part : p));
      this.bumpMasks([key]);
      // this window's own stroke on the outlines it held: the page holds the new version
      this.outlinesVersion = outlines;
      return part;
    },
    async addPart(key, paintable = true) {
      const part = await post(hp(this.house.id, "/parts"), { key, paintable });
      this.parts = [...this.parts, part];
      this.selectedPart = key;
      return part;
    },
    /** The paint part `key` has NOW (null clears it): the light on it is worked out from it. Kept on the
     *  server with the house (finding the parts again keeps it). */
    async setCurrentPaint(key, paintId) {
      const id = this.house.id;
      // this part only (JSON Merge Patch): another window's paints-now stay
      const house = await patchJson(hp(id, "/current-paints"), { [key]: paintId || null });
      if (this.house?.id === id) this.house = { ...house, outlines: this.house.outlines };
    },
    /** The colors on screen replaced whole, and the design they belong to (an Undo, a Redo). */
    setColors(colors, designId = this.designId) {
      this.designId = designId;
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
    /** `roleParts` (the `schemes.roleParts` setting) names the trim group the design is checked for. */
    openDesign(id, roleParts) {
      const d = this.designs.find((x) => x.id === id);
      if (!d) return;
      this.designId = id;
      this.colors = { ...d.colors };
      const offer = unpaintedTrim(d.colors, this.paintableParts.map((p) => p.key), roleParts);
      this.trimOffer = offer ? { ...offer, designId: id } : null;
    },
    /** The trim offer taken: its parts painted the design's trim color, in one step (one Undo). */
    applyTrimOffer() {
      if (!this.trimOfferParts.length) return;
      const { paintId } = this.trimOffer;
      const add = Object.fromEntries(this.trimOfferParts.map((key) => [key, paintId]));
      this.trimOffer = null;
      this.colors = { ...this.colors, ...add };
    },
    dismissTrimOffer() {
      this.trimOffer = null;
    },
    async saveDesignAs(name) {
      const d = await post(hp(this.house.id, "/designs"), { name, colors: this.colors });
      this.designs = [...this.designs, d];
      this.designId = d.id;
      return d;
    },
    /** The open design saved: the parts changed on screen since it was read (JSON Merge Patch) — another
     *  window's changes to its other parts stay, and come back here with the answer. */
    async saveDesign() {
      const d = await patchJson(`/v1/designs/${encodeURIComponent(this.designId)}`, { colors: colorsPatch(this.design?.colors, this.colors) });
      this.designs = this.designs.map((x) => (x.id === d.id ? d : x));
      if (this.designId === d.id && !sameColors(this.colors, d.colors)) this.colors = { ...d.colors };
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
    /** An AI photo of the colors on screen (a server job) — or `job`, one already being made (runningJobs),
     *  followed. Resolves with the kept render. */
    async aiPhoto(label, { job = null } = {}) {
      const id = this.house.id;
      const start = job ? async () => job : () => post(hp(id, "/aiphoto"), { colors: this.colors });
      const render = await runServerJob({ start, feature: "aiphoto.render", label, meta: { houseId: id } });
      // kept with its house on the server; listed here only while that house is open
      if (this.house?.id === id) this.renders = [render, ...this.renders];
      return render;
    },
    async deleteRender(id) {
      await del(`/v1/renders/${encodeURIComponent(id)}`);
      this.renders = this.renders.filter((r) => r.id !== id);
    },
  },
});
