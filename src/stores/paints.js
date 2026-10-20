// SPDX-License-Identifier: MIT
// The paint colors: the brands (loaded from a public list, or imported from a palette file), the
// search the Colors tab runs, and the schemes. The server keeps every color (family rule 2); this
// keeps the brand list, the screen's search and the paints a house's colors name.
import { del, get, post, postForm } from "@delebash/ui";
import { defineStore } from "pinia";
import { runServerJob } from "../services/jobs.js";

const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  return q.toString();
};

// the start-up loads in flight (autoLoadBrands), so a second call joins them
let autoLoading = null;

export const usePaintsStore = defineStore("paints", {
  state: () => ({
    brands: [],
    brandsLoaded: false,
    // paints already seen, by id — a design's colors are looked up here first
    byId: {},
    // ids the server has no paint for (its brand's new list dropped it, or the brand was removed)
    missing: {},
    // the start-up loads are running (the Colors and Schemes tabs say "loading", not "add a brand")
    autoLoadingBrands: false,
  }),
  getters: {
    /** Brands that have colors on this computer. */
    ready: (s) => s.brands.filter((b) => b.paintCount > 0),
  },
  actions: {
    remember(rows) {
      const next = { ...this.byId };
      for (const p of rows) next[p.id] = p;
      this.byId = next;
      if (rows.some((p) => this.missing[p.id])) this.missing = Object.fromEntries(Object.entries(this.missing).filter(([id]) => !next[id]));
    },
    /** A paint id's brand (its label) and code — for a color that isn't loaded ("brand:code"). */
    idParts(id) {
      const at = id.indexOf(":");
      const key = at < 0 ? id : id.slice(0, at);
      return { brand: this.brands.find((b) => b.key === key)?.label || key, code: at < 0 ? "" : id.slice(at + 1) };
    },
    /** The designs that use a brand's colors: [{ house, design, parts, … }] (Remove names them). */
    designsUsing(brand) {
      return get(`/v1/brands/${encodeURIComponent(brand)}/designs`);
    },
    async loadBrands() {
      this.brands = await get("/v1/brands");
      this.brandsLoaded = true;
    },
    /** Load a brand's colors (a server job on the task strip). The brands are read again whether it
     *  worked or not — a failed load's reason is on its row (the server's lastError). */
    async loadFeed(brand, label) {
      try {
        return await runServerJob({ start: () => post(`/v1/brands/${encodeURIComponent(brand)}/load`), feature: "paints.load", label, meta: { brand } });
      } finally {
        await this.loadBrands().catch(() => {});
      }
    },
    /**
     * Every brand's colors out of the box (the user's decision, 2026-10-18): each brand the app can
     * fetch, with "Load automatically" on (`autoLoad`, the setting — a brand missing from it counts as
     * on) and no colors yet, loads — one after another, so the brands' sites aren't asked all at once.
     * Each load is a task (the kit's stack shows it, with Cancel); a failure stays on the brand's row
     * and in the AI tasks panel, never as a toast at start-up. One run at a time.
     */
    autoLoadBrands({ autoLoad = {}, label }) {
      autoLoading ??= (async () => {
        this.autoLoadingBrands = true;
        if (!this.brandsLoaded) await this.loadBrands();
        for (const b of this.brands) {
          if (!b.feed || b.paintCount || autoLoad[b.key] === false) continue;
          try {
            await this.loadFeed(b.key, label(b));
          } catch {
            // recorded on the brand's row (lastError) and kept in the AI tasks panel
          }
        }
      })().finally(() => {
        autoLoading = null;
        this.autoLoadingBrands = false;
      });
      return autoLoading;
    },
    async importFile(brand, file) {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("brand", brand);
      const result = await postForm("/v1/paints/import", form);
      await this.loadBrands();
      return result;
    },
    async clearBrand(brand) {
      await del(`/v1/brands/${encodeURIComponent(brand)}`);
      await this.loadBrands();
    },
    /** One page of the search: { total, rows } — `order` "color" or "name", `colorFamily` a family key. */
    async search({ brand, q, family, colorFamily, order, exterior = true, archived = false, limit = 120, offset = 0 } = {}) {
      const page = await get(`/v1/paints?${query({ brand, q, family, colorFamily, order, exterior, archived, limit, offset })}`);
      this.remember(page.rows);
      return page;
    },
    async paint(id) {
      if (this.byId[id]) return this.byId[id];
      try {
        const p = await get(`/v1/paints/${encodeURIComponent(id)}`);
        this.remember([p]);
        return p;
      } catch (e) {
        // a color the server no longer has: the part says so, instead of looking unpainted
        if (e?.status === 404) this.missing = { ...this.missing, [id]: true };
        throw e;
      }
    },
    /** The paints a list of ids names (unknown ones fetched). */
    async paints(ids) {
      const missing = [...new Set(ids)].filter((id) => id && !this.byId[id]);
      await Promise.all(missing.map((id) => this.paint(id).catch(() => null)));
      return ids.map((id) => this.byId[id] || null);
    },
    nearest(hex, { brand, k = 6, exterior = true } = {}) {
      return get(`/v1/paints/nearest?${query({ hex, brand, k, exterior })}`);
    },
    harmony(base, brand, kinds) {
      return post("/v1/schemes/harmony", { base, brand, ...(kinds ? { kinds } : {}) });
    },
    coordinating(paintId) {
      return get(`/v1/paints/${encodeURIComponent(paintId)}/schemes`);
    },
  },
});
