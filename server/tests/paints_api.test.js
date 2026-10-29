// SPDX-License-Identifier: MIT
// /v1/brands, /v1/paints, /v1/schemes — on SYNTHETIC lists only (the app ships no brand data).
import { afterEach, describe, expect, test } from "vitest";
import { setSetting } from "../src/database/settings.js";
import { COLOR_ORDER_DEFAULTS, familyKeys, familyOf, lch } from "../src/paints/index.js";
import { jpeg, makeServer } from "./domain_helpers.js";
import { behrSheet, prismDutchBoy, prismLowes, prismSherwin } from "./paints/fixtures/feeds.js";
import { syntheticPalette } from "./paints/fixtures/palette.js";
import { writeAse } from "./paints/fixtures/swatch-writers.js";

const FEEDS = {
  "/prism/v1/colors/sherwin": prismSherwin,
  "/prism/v1/colors/lowes": prismLowes,
  "/prism/v1/colors/dutchboy": prismDutchBoy,
  "query-index.json": behrSheet(),
};
const fakeFetch = async (url) => {
  const hit = Object.entries(FEEDS).find(([k]) => String(url).includes(k));
  if (!hit) return new Response("not found", { status: 404 });
  return new Response(JSON.stringify(hit[1]), { status: 200, headers: { "content-type": "application/json" } });
};

let s;
afterEach(() => s?.close());

describe("brands", () => {
  test("every launch brand is listed, empty until loaded", async () => {
    s = makeServer({ fetch: fakeFetch });
    const brands = await (await s.app.request("/v1/brands")).json();
    expect(brands.map((b) => b.key)).toEqual(["sherwin-williams", "behr", "benjamin-moore", "valspar", "ppg-glidden", "hgtv-home", "dutch-boy"]);
    // Benjamin Moore and PPG / Glidden load from the palette files their pages link to
    expect(brands.find((b) => b.key === "benjamin-moore")).toMatchObject({ feed: true, via: "files", enabled: false, paintCount: 0 });
    expect(brands.find((b) => b.key === "ppg-glidden")).toMatchObject({ feed: true, via: "files" });
    expect(brands.every((b) => b.feed)).toBe(true);
    // the rest from a public list — the screen names an app's load "public list" or "the brand's files" by `via`
    expect(brands.filter((b) => b.via === "list").map((b) => b.key)).toEqual(["sherwin-williams", "behr", "valspar", "hgtv-home", "dutch-boy"]);
  });

  test("loading a public list is a job; its colors become searchable", async () => {
    s = makeServer({ fetch: fakeFetch });
    const job = await (await s.json("POST", "/v1/brands/sherwin-williams/load")).json();
    const done = await s.settle(job.id);
    expect(done.state).toBe("done");
    expect(done.result.paintCount).toBeGreaterThan(0);
    const brand = (await (await s.app.request("/v1/brands")).json()).find((b) => b.key === "sherwin-williams");
    expect(brand).toMatchObject({ enabled: true, source: "feed", paintCount: done.result.paintCount, lastError: null });
    // search hides discontinued colors unless asked
    const all = await (await s.app.request("/v1/paints?brand=sherwin-williams&limit=500&archived=true")).json();
    expect(all.total).toBe(done.result.paintCount);
    const current = await (await s.app.request("/v1/paints?brand=sherwin-williams&limit=500")).json();
    expect(current.rows.every((p) => !p.archived)).toBe(true);
    expect(all.rows[0]).toMatchObject({ brand: "sherwin-williams", hex: expect.stringMatching(/^#[0-9a-f]{6}$/i) });
    expect(all.rows[0].displayName).toMatch(/^SW /);
  });

  test("Benjamin Moore loads from the swatch files its palette page links to — each collection, each color once", async () => {
    const rgb01 = (r, g, b) => [r / 255, g / 255, b / 255];
    const classics = writeAse([{ group: "Classics", swatches: [{ name: "HC-154 Hale Navy", model: "RGB", values: rgb01(67, 75, 86) }, { name: "OC-17 White Dove", model: "RGB", values: rgb01(240, 238, 228) }] }]);
    const offWhites = writeAse([{ group: "Off-White", swatches: [{ name: "OC-17 White Dove", model: "RGB", values: rgb01(240, 238, 228) }, { name: "OC-65 Chantilly Lace", model: "RGB", values: rgb01(244, 243, 237) }] }]);
    const page = `<a href="/-/media/files/palettedownloads/ase/en-us/benjaminmoore_classiccolors_en-us.ase">Classic</a>
      <a href='/-/media/files/palettedownloads/ase/en-us/benjaminmoore_off-whitecolors_en-us.ase'>Off-White</a>
      <a href="/-/media/files/palettedownloads/ase/en-us/import_instructions_for_adobe_products_us.pdf">Help</a>`;
    const fetched = [];
    const bmFetch = async (url) => {
      fetched.push(String(url));
      if (String(url).endsWith("download-benjamin-moore-color-palettes")) return new Response(page, { status: 200, headers: { "content-type": "text/html" } });
      if (String(url).endsWith("classiccolors_en-us.ase")) return new Response(classics, { status: 200 });
      if (String(url).endsWith("off-whitecolors_en-us.ase")) return new Response(offWhites, { status: 200 });
      return new Response("not found", { status: 404 });
    };
    s = makeServer({ fetch: bmFetch });
    const done = await s.settle((await (await s.json("POST", "/v1/brands/benjamin-moore/load")).json()).id);
    expect(done.state).toBe("done");
    expect(done.result.paintCount).toBe(3); // White Dove is in both collections: once
    // its row says the colors came from palette files, not a public list
    expect((await (await s.app.request("/v1/brands")).json()).find((b) => b.key === "benjamin-moore").source).toBe("file");
    expect(fetched.filter((u) => u.endsWith(".pdf"))).toEqual([]); // only the swatch files
    const found = await (await s.app.request("/v1/paints?brand=benjamin-moore&q=lace")).json();
    expect(found.rows.map((p) => p.name)).toEqual(["Chantilly Lace"]);
  });

  test("a page that links no palette file, or a site that's down, fails the load and records why", async () => {
    s = makeServer({ fetch: async () => new Response("<p>moved</p>", { status: 200 }) });
    const moved = await s.settle((await (await s.json("POST", "/v1/brands/ppg-glidden/load")).json()).id);
    expect(moved.state).toBe("error");
    const ppg = (await (await s.app.request("/v1/brands")).json()).find((b) => b.key === "ppg-glidden");
    expect(ppg.lastError).toMatch(/links no palette file/);
    expect((await s.json("POST", "/v1/brands/nope/load")).status).toBe(404);
    s.close();
    s = makeServer(); // offline: the default fetch answers 503
    const failed = await s.settle((await (await s.json("POST", "/v1/brands/behr/load")).json()).id);
    expect(failed.state).toBe("error");
    const behr = (await (await s.app.request("/v1/brands")).json()).find((b) => b.key === "behr");
    expect(behr.lastError).toBeTruthy();
    expect(behr.paintCount).toBe(0);
  });

  test("colors without a number are left out with a warning — never stored as one shared row", async () => {
    s = makeServer();
    const csv = ["name,hex", "Pale Ecru,#efe6d2", "Deep Sea,#123456", "Moss,#55663a"].join("\n");
    const form = new FormData();
    form.append("file", new Blob([csv]), "valspar-names.csv");
    form.append("brand", "valspar");
    const r = await s.app.request("/v1/paints/import", { method: "POST", body: form });
    expect(r.status).toBe(422);
    // under the file's field (the family's errors list)
    expect((await r.json()).errors).toMatchObject([{ loc: ["body", "file"], msg: expect.stringMatching(/3 colors without a number left out/) }]);
    const mixed = new FormData();
    mixed.append("file", new Blob([["code,name,hex", "1001,Pale Ecru,#efe6d2", ",Deep Sea,#123456"].join("\n")]), "valspar.csv");
    mixed.append("brand", "valspar");
    const ok = await (await s.app.request("/v1/paints/import", { method: "POST", body: mixed })).json();
    expect(ok).toMatchObject({ paintCount: 1, warnings: ["1 color without a number left out"] });
    expect((await (await s.app.request("/v1/brands")).json()).find((b) => b.key === "valspar").paintCount).toBe(1);
  });

  test("a brand key that is a built-in object name is no brand (the nineteenth review's fuzz)", async () => {
    s = makeServer({ fetch: fakeFetch });
    for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      const form = new FormData();
      form.append("file", new Blob([writeAse([{ group: "G", swatches: [{ name: "OC-17 White Dove", model: "RGB", values: [0.94, 0.93, 0.89] }] }])]), "palette.ase");
      form.append("brand", key);
      expect((await s.app.request("/v1/paints/import", { method: "POST", body: form })).status).toBe(422);
    }
    expect((await s.json("POST", "/v1/brands/constructor/load")).status).toBe(404);
    expect((await s.json("POST", "/v1/schemes/harmony", { base: "#808080", brand: "constructor" })).status).toBe(404);
  });

  test("an official palette file is imported for its brand; clearing a brand removes its colors", async () => {
    s = makeServer();
    const rgb01 = (r, g, b) => [r / 255, g / 255, b / 255];
    const ase = writeAse([
      {
        group: "Classics",
        swatches: [
          { name: "OC-17 White Dove", model: "RGB", values: rgb01(240, 238, 228) },
          { name: "HC-154 Hale Navy", model: "RGB", values: rgb01(67, 75, 86) },
        ],
      },
    ]);
    const form = new FormData();
    form.append("file", new Blob([ase]), "benjaminmoore_classiccolors_en-us.ase");
    form.append("brand", "benjamin-moore");
    const r = await s.app.request("/v1/paints/import", { method: "POST", body: form });
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ brand: "benjamin-moore", format: "ase", paintCount: 2 });
    const found = await (await s.app.request("/v1/paints?q=navy")).json();
    expect(found.rows.map((p) => p.name)).toEqual(["Hale Navy"]);
    const bad = new FormData();
    bad.append("file", new Blob([Buffer.from("x")]), "a.ase");
    bad.append("brand", "nobody");
    expect((await s.app.request("/v1/paints/import", { method: "POST", body: bad })).status).toBe(422);
    expect((await s.app.request("/v1/brands/benjamin-moore", { method: "DELETE" })).status).toBe(204);
    expect((await (await s.app.request("/v1/paints")).json()).total).toBe(0);
  });

  test("a brand's designs are named before it is removed, and a new list names the designs it left without a color", async () => {
    s = makeServer();
    const rgb01 = (r, g, b) => [r / 255, g / 255, b / 255];
    const importBm = async (swatches) => {
      const form = new FormData();
      form.append("file", new Blob([writeAse([{ group: "Classics", swatches }])]), "bm.ase");
      form.append("brand", "benjamin-moore");
      return (await s.app.request("/v1/paints/import", { method: "POST", body: form })).json();
    };
    const dove = { name: "OC-17 White Dove", model: "RGB", values: rgb01(240, 238, 228) };
    const navy = { name: "HC-154 Hale Navy", model: "RGB", values: rgb01(67, 75, 86) };
    expect((await importBm([dove, navy])).lost).toEqual([]);
    const ids = Object.fromEntries((await (await s.app.request("/v1/paints?brand=benjamin-moore")).json()).rows.map((p) => [p.name, p.id]));
    const house = await (await s.upload(await jpeg(400, 300))).json();
    const design = await (await s.json("POST", `/v1/houses/${house.id}/designs`, { name: "Navy trim", colors: { body: ids["White Dove"], trim: ids["Hale Navy"] } })).json();
    const named = { houseId: house.id, house: house.name, designId: design.id, design: "Navy trim" };
    expect(await (await s.app.request("/v1/brands/benjamin-moore/designs")).json()).toEqual([{ ...named, parts: ["body", "trim"] }]);
    expect(await (await s.app.request("/v1/brands/behr/designs")).json()).toEqual([]);
    // the brand's new file has no Hale Navy: the design is named, its trim keeps the id (the color comes back with it)
    expect((await importBm([dove])).lost).toEqual([{ ...named, parts: ["trim"] }]);
    expect((await (await s.app.request(`/v1/houses/${house.id}/designs`)).json())[0].colors.trim).toBe(ids["Hale Navy"]);
    expect((await importBm([dove, navy])).lost).toEqual([]);
    expect((await s.app.request("/v1/brands/nobody/designs")).status).toBe(404);
  });
});

describe("search, nearest, schemes", () => {
  async function withPalette() {
    s = makeServer();
    // the synthetic OKLCH grid, imported as a CSV file for one brand
    const rows = syntheticPalette({ brand: "behr" });
    const csv = ["code,name,hex,exterior", ...rows.map((r) => `${r.code},${r.name},${r.hex},yes`)].join("\n");
    const form = new FormData();
    form.append("file", new Blob([csv]), "behr-test.csv");
    form.append("brand", "behr");
    const r = await s.app.request("/v1/paints/import", { method: "POST", body: form });
    expect(r.status).toBe(201);
    return rows;
  }

  test("a search's control characters are no search; an offset past 64 bits is refused, never a 500 (the nineteenth's fuzz)", async () => {
    s = makeServer({ fetch: fakeFetch });
    await s.settle((await (await s.json("POST", "/v1/brands/sherwin-williams/load")).json()).id);
    const all = (await (await s.app.request("/v1/paints?brand=sherwin-williams")).json()).total;
    const nul = await (await s.app.request("/v1/paints?brand=sherwin-williams&q=%00")).json();
    expect(nul.total).toBe(all); // stripped: the same as no query, not a match of every row by a NUL
    // a pasted TAB is a space and a zero-width space nothing, on both sides (the twentieth review: "Shade<TAB>12"
    // became "Shade12" and matched nothing)
    const one = (await (await s.app.request("/v1/paints?brand=sherwin-williams&limit=1")).json()).rows[0].name;
    const words = one.split(" ");
    expect(words.length).toBeGreaterThan(1); // "Fixture Linen"
    const tabbed = await (await s.app.request(`/v1/paints?brand=sherwin-williams&q=${encodeURIComponent(words.join("\t"))}`)).json();
    expect(tabbed.rows.map((r) => r.name)).toContain(one);
    const hidden = await (await s.app.request(`/v1/paints?brand=sherwin-williams&q=${encodeURIComponent(`${one.slice(0, 2)}​${one.slice(2)}`)}`)).json();
    expect(hidden.rows.map((r) => r.name)).toContain(one);
    expect((await s.app.request("/v1/paints?brand=sherwin-williams&offset=9223372036854775808")).status).toBe(422);
  });

  test("search by name or code, paged; its query is checked", async () => {
    const rows = await withPalette();
    const page = await (await s.app.request("/v1/paints?q=Test 1&limit=5")).json();
    expect(page.rows).toHaveLength(5);
    expect(page.total).toBeGreaterThan(5);
    expect((await (await s.app.request(`/v1/paints?q=${rows[0].code}`)).json()).rows[0].code).toBe(rows[0].code);
    expect((await s.app.request("/v1/paints?limit=0")).status).toBe(422);
    expect((await (await s.app.request("/v1/paints?q=%25")).json()).total).toBe(0); // a % is a character, not a wildcard
  });

  test("by color: the near-grays light to dark, then each hue band light to dark — paged, nothing lost", async () => {
    const rows = await withPalette();
    const lab = Object.fromEntries(rows.map((r) => [r.code, r.lab]));
    const page = async (offset) => (await s.app.request(`/v1/paints?order=color&limit=500&offset=${offset}`)).json();
    const first = await page(0);
    const got = [...first.rows, ...(await page(500)).rows];
    expect(first.total).toBe(rows.length);
    expect(new Set(got.map((p) => p.code)).size).toBe(rows.length);
    // the wall's order: [near-gray first, the hue band from the reds' start, lighter first]
    const { grayChroma, bandDegrees, families } = COLOR_ORDER_DEFAULTS;
    const place = (p) => {
      const { chroma, hue } = lch(lab[p.code]);
      const gray = chroma < grayChroma;
      return [gray ? 0 : 1, gray ? 0 : Math.floor(((hue - families[0].from + 360) % 360) / bandDegrees), -lab[p.code][0]];
    };
    const after = (a, b) => a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2] - 1e-9)));
    for (let i = 1; i < got.length; i++) expect(after(place(got[i]), place(got[i - 1]))).toBe(true);
    expect(place(got[0])[0]).toBe(0); // a white first
    expect(lab[got[0].code][0]).toBeGreaterThan(95);
    // by name stays the default
    const byName = (await (await s.app.request("/v1/paints?limit=3")).json()).rows.map((p) => p.name);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b)));
    expect((await s.app.request("/v1/paints?order=hue")).status).toBe(422);
  });

  test("a Color family: the near-grays or one hue range; every color in exactly one; the setting moves the cuts", async () => {
    const rows = await withPalette();
    const lab = Object.fromEntries(rows.map((r) => [r.code, r.lab]));
    let sum = 0;
    for (const key of familyKeys(COLOR_ORDER_DEFAULTS)) {
      const found = await (await s.app.request(`/v1/paints?colorFamily=${key}&limit=500`)).json();
      expect(found.total).toBeGreaterThan(0);
      expect(found.rows.every((p) => familyOf(lab[p.code]) === key)).toBe(true);
      sum += found.total;
    }
    expect(sum).toBe(rows.length);
    expect((await s.app.request("/v1/paints?colorFamily=browns")).status).toBe(422);
    // the family cuts and the near-gray chroma are a setting, read on every search
    const edited = { ...COLOR_ORDER_DEFAULTS, grayChroma: 0, families: [{ key: "warm", from: 0 }, { key: "cool", from: 180 }] };
    setSetting(s.db, "paints.colorOrder", edited);
    expect((await (await s.app.request("/v1/paints?colorFamily=neutrals")).json()).total).toBe(0);
    const warm = (await (await s.app.request("/v1/paints?colorFamily=warm")).json()).total;
    const cool = (await (await s.app.request("/v1/paints?colorFamily=cool")).json()).total;
    expect(warm + cool).toBe(rows.length);
    expect((await s.app.request("/v1/paints?colorFamily=reds")).status).toBe(422);
  });

  test("the nearest real paints to a color, closest first", async () => {
    await withPalette();
    const near = await (await s.app.request("/v1/paints/nearest?hex=%23ad2c34&k=3")).json();
    expect(near).toHaveLength(3);
    expect(near[0].deltaE).toBeLessThanOrEqual(near[2].deltaE);
    expect(near[0].paint.brand).toBe("behr");
    expect((await s.app.request("/v1/paints/nearest?hex=red")).status).toBe(422);
  });

  test("schemes from a color snap every role to a real paint", async () => {
    await withPalette();
    const schemes = await (await s.json("POST", "/v1/schemes/harmony", { base: "#3b6e8f", brand: "behr" })).json();
    expect(schemes.length).toBeGreaterThan(0);
    const complete = schemes.find((x) => x.complete);
    expect(complete.roles.body.paint.id).toMatch(/^behr:/);
    expect(new Set([complete.roles.body.paint.id, complete.roles.trim.paint.id, complete.roles.accent.paint.id]).size).toBe(3);
    expect((await s.json("POST", "/v1/schemes/harmony", { base: "#3b6e8f", brand: "valspar" })).status).toBe(409);
    expect((await s.json("POST", "/v1/schemes/harmony", { base: "nope", brand: "behr" })).status).toBe(422);
    expect((await s.json("POST", "/v1/schemes/harmony", { base: "#3b6e8f", brand: "behr", kinds: ["bogus"] })).status).toBe(422);
  });
});
