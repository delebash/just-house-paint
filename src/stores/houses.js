// SPDX-License-Identifier: MIT
// Your houses — the gallery's store (app-structure §4: one store per domain). The server owns the
// houses (family rule 2); this holds what the Your houses page shows. A failed call throws the
// kit's Error (status, problem, errors, requestId — §15) and the page decides how to show it.
import { del, get, patch as patchJson, postForm } from "@delebash/ui";
import { defineStore } from "pinia";

const path = (id) => `/v1/houses/${encodeURIComponent(id)}`;

/** The server's order: the most recently changed first. */
export const sortHouses = (items) => [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));

export const useHousesStore = defineStore("houses", {
  state: () => ({
    items: [],
    loading: false,
    loaded: false,
  }),
  actions: {
    async load() {
      this.loading = true;
      try {
        this.items = sortHouses(await get("/v1/houses"));
        this.loaded = true;
      } finally {
        this.loading = false;
      }
    },
    /** Add a photo (a File); `name` optional — the server takes it from the file's name. */
    async add(file, name) {
      const form = new FormData();
      form.append("file", file, file.name);
      if (name) form.append("name", name);
      const house = await postForm("/v1/houses", form);
      this.items = sortHouses([{ ...house, designCount: 0 }, ...this.items]);
      return house;
    },
    async rename(id, name) {
      const house = await patchJson(path(id), { name });
      this.items = sortHouses(this.items.map((h) => (h.id === id ? { ...h, ...house } : h)));
      return house;
    },
    async remove(id) {
      await del(path(id));
      this.items = this.items.filter((h) => h.id !== id);
    },
  },
});

/** A house's photo, at one of the server's sizes — a server path for the kit's UiServerImage or
 *  requestBlob (never a bare <img src>: it would carry no access token). */
export const imagePath = (id, size = "display", stamp = "") =>
  `/v1/houses/${encodeURIComponent(id)}/image?size=${size}${stamp ? `&v=${encodeURIComponent(stamp)}` : ""}`;
