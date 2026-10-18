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

export const usePaintsStore = defineStore("paints", {
  state: () => ({
    brands: [],
    brandsLoaded: false,
    // paints already seen, by id — a design's colors are looked up here first
    byId: {},
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
    },
    async loadBrands() {
      this.brands = await get("/v1/brands");
      this.brandsLoaded = true;
    },
    /** Load a brand's public list (a server job on the task strip). */
    async loadFeed(brand, label) {
      const result = await runServerJob({ start: () => post(`/v1/brands/${encodeURIComponent(brand)}/load`), feature: "paints.load", label });
      await this.loadBrands();
      return result;
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
    /** One page of the search: { total, rows }. */
    async search({ brand, q, family, exterior = true, archived = false, limit = 120, offset = 0 } = {}) {
      const page = await get(`/v1/paints?${query({ brand, q, family, exterior, archived, limit, offset })}`);
      this.remember(page.rows);
      return page;
    },
    async paint(id) {
      if (this.byId[id]) return this.byId[id];
      const p = await get(`/v1/paints/${encodeURIComponent(id)}`);
      this.remember([p]);
      return p;
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
