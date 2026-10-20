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
import { jobGone, runServerJob } from "../services/jobs.js";

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
    // the version of each house's outlines the page holds (the server's ETag): an outline write sends it
    // (If-Match) — a save that runs after the page left its house too. The page takes a new one only once it has
    // the outlines that go with it (useOutlines), or from the answer to its own write made on it
    versions: {},
    // the open design's colors the draft on screen started from (a three-way merge's base): a save sends what
    // changed since, and another window's change to the design moves the parts left as they were
    designBase: null,
    // a color read off the photo (the eyedropper, a part's color as photographed) for the Colors tab:
    // { hex, at } until the tab takes it
    pickedColor: null,
    // the open design's trim-group parts with no color, offered on the Designs tab (unpaintedTrim):
    // { parts, paintId } until painted, dismissed or another design is opened
    trimOffer: null,
  }),
  getters: {
    design: (s) => s.designs.find((d) => d.id === s.designId) || null,
    /** The open house's outlines' version the page holds. */
    outlinesVersion: (s) => (s.house ? (s.versions[s.house.id] ?? null) : null),
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
        const { [id]: _, ...versions } = this.versions;
        Object.assign(this, { house, parts, designs, renders, colors: {}, designId: null, designBase: null, maskVersions: {}, pickedColor: null, trimOffer: null, versions });
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
      Object.assign(this, { house, parts, renders });
      this.takeDesigns(designs);
      if (outlinesChanged) this.bumpMasks(parts.map((p) => p.key));
      if (!parts.some((p) => p.key === this.selectedPart)) this.selectedPart = this.paintableParts[0]?.key ?? null;
      return { outlinesChanged };
    },
    /** The house's designs read again (one deleted in another window). */
    async refreshDesigns() {
      const id = this.house.id;
      const designs = await get(hp(id, "/designs"));
      if (this.house?.id !== id) return;
      this.takeDesigns(designs);
    },
    /** The server's designs in place of these. The open design changed in another window: the draft is rebased —
     *  a three-way merge, each part this window left as the design had it takes the design's new paint, one it
     *  changed keeps this window's. Deleted there: the colors stay, a draft. */
    takeDesigns(incoming) {
      // an answer read before this window's own save landed (older than the design held) never undoes it on screen
      const held = new Map(this.designs.map((d) => [d.id, d]));
      const designs = incoming.map((d) => {
        const mine = held.get(d.id);
        return mine && String(mine.updatedAt || "") > String(d.updatedAt || "") ? mine : d;
      });
      this.designs = designs;
      const open = this.designId && designs.find((d) => d.id === this.designId);
      if (!open) {
        if (this.designId) this.designId = null;
        this.designBase = null;
        return;
      }
      const base = this.designBase || {};
      if (sameColors(base, open.colors)) return;
      const next = { ...this.colors };
      for (const k of new Set([...Object.keys(base), ...Object.keys(open.colors)])) {
        if ((this.colors[k] || null) !== (base[k] || null)) continue; // changed here: this window's stays
        if (open.colors[k]) next[k] = open.colors[k];
        else delete next[k];
      }
      this.designBase = { ...open.colors };
      if (!sameColors(next, this.colors)) this.colors = next;
    },
    /** The page has the outlines of version `v` (read after it): its writes send it from now on. */
    useOutlines(v) {
      if (this.house) this.versions = { ...this.versions, [this.house.id]: v };
    },
    /** The If-Match an outline write to house `houseId` sends (none until the page held its outlines). */
    ifMatch(houseId = this.house?.id) {
      const v = this.versions[houseId];
      return v ? { "If-Match": v } : {};
    },
    /** The answer to this window's write made on version `sent` of house `houseId`'s outlines: its new version —
     *  unless the page took another meanwhile (the outlines read again: that one stands). */
    answered(houseId, sent, v) {
      if (this.versions[houseId] === sent) this.versions = { ...this.versions, [houseId]: v };
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
      const start = job ? async () => job : () => post(hp(id, "/find-parts"), { keepEdited }, { headers: this.ifMatch(id) });
      let gone = null;
      try {
        await runServerJob({ start, feature: "parts.find", label, meta: { houseId: id }, describe });
      } catch (e) {
        // it ended while the window was away (done: read quietly, as if followed to the end), or the server started
        // again: its parts are read as they are (the run may have saved before), then said
        if (e?.name === "JobEnded" && e.state === "done") gone = null;
        else if (e?.name === "JobGone" || e?.name === "JobEnded") gone = e.name === "JobGone" ? e : jobGone();
        else throw e;
      }
      // another house opened meanwhile: this one's parts are on the server, read when it opens again
      if (this.house?.id !== id) return;
      const [house, parts] = await Promise.all([get(hp(id)), get(hp(id, "/parts"))]);
      if (this.house?.id !== id) return;
      this.house = house;
      this.parts = parts;
      this.bumpMasks(parts.map((p) => p.key));
      if (!parts.some((p) => p.key === this.selectedPart)) this.selectedPart = this.paintableParts[0]?.key ?? null;
      if (gone) throw gone;
    },
    /** What is inside a box (display pixels) joins the part (`add`) or leaves it (`remove`). */
    async box(key, box, mode = "add") {
      const id = this.house.id;
      const headers = this.ifMatch(id);
      const r = await post(hp(id, `/parts/${encodeURIComponent(key)}/box`), { ...box, mode }, { headers });
      // the page holds the box's result once it has read the changed outlines — it was current before (If-Match)
      this.answered(id, headers["If-Match"], r.outlines);
      if (this.house?.id !== id) return [];
      this.parts = r.parts;
      this.bumpMasks(r.changed);
      return r.changed;
    },
    /** The brush's result for one part: a PNG Blob at the display size, saved to `houseId` — the house
     *  it was drawn on (a save can run after the page left it). */
    async saveMask(key, pngBlob, houseId = this.house.id) {
      // raw PNG bytes (the kit's put() would send JSON)
      const headers = { "Content-Type": "image/png", ...this.ifMatch(houseId) };
      const { outlines, ...part } = await request(hp(houseId, `/parts/${encodeURIComponent(key)}/mask`), { method: "PUT", headers, body: pngBlob });
      // this window's own stroke on the outlines it held: the page holds the new version
      this.answered(houseId, headers["If-Match"], outlines);
      if (this.house?.id !== houseId) return part;
      this.parts = this.parts.map((p) => (p.key === key ? part : p));
      this.bumpMasks([key]);
      return part;
    },
    /** A part added by hand: its row changes the outlines' version — made on the version the page holds (If-Match),
     *  its answer is the next one (as a stroke's is). */
    async addPart(key, paintable = true) {
      const id = this.house.id;
      const headers = this.ifMatch(id);
      const { outlines, ...part } = await post(hp(id, "/parts"), { key, paintable }, { headers });
      this.answered(id, headers["If-Match"], outlines);
      if (this.house?.id !== id) return part;
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
    /** The colors on screen replaced whole, the design they belong to and the design's colors they started from
     *  (an Undo, a Redo — a step back to another design's draft takes that draft's merge base along). */
    setColors(colors, designId = this.designId, designBase = designId === this.designId ? this.designBase : null) {
      this.designId = designId;
      this.designBase = designId ? designBase : null;
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
      this.designBase = { ...d.colors };
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
      this.designBase = { ...d.colors };
      return d;
    },
    /** The open design saved: the parts changed on screen since it was read (JSON Merge Patch) — another
     *  window's changes to its other parts stay, and come back here with the answer. */
    async saveDesign() {
      // what changed here since the draft's base — never the design's newer paints read since (another window's)
      const d = await patchJson(`/v1/designs/${encodeURIComponent(this.designId)}`, { colors: colorsPatch(this.designBase ?? this.design?.colors, this.colors) });
      this.designs = this.designs.map((x) => (x.id === d.id ? d : x));
      if (this.designId === d.id) {
        this.designBase = { ...d.colors };
        if (!sameColors(this.colors, d.colors)) this.colors = { ...d.colors };
      }
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
      if (this.designId === id) {
        this.designId = null;
        this.designBase = null;
      }
    },
    /** An AI photo of the colors on screen (a server job) — or `job`, one already being made (runningJobs),
     *  followed. Resolves with the kept render. */
    async aiPhoto(label, { job = null } = {}) {
      const id = this.house.id;
      const start = job ? async () => job : () => post(hp(id, "/aiphoto"), { colors: this.colors });
      let render;
      try {
        render = await runServerJob({ start, feature: "aiphoto.render", label, meta: { houseId: id } });
      } catch (e) {
        if (e?.name !== "JobGone" && e?.name !== "JobEnded") throw e;
        // the server started again, or the photo ended while the window was away: its AI photos as they are
        const renders = await get(hp(id, "/renders")).catch(() => null);
        if (renders && this.house?.id === id) this.renders = renders;
        // made while away: the newest one is it
        if (e.name === "JobEnded" && e.state === "done" && renders?.length) return renders[0];
        throw e.name === "JobEnded" ? jobGone() : e;
      }
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
