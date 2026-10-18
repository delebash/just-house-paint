// SPDX-License-Identifier: MIT
// /v1/brands, /v1/paints, /v1/schemes — on SYNTHETIC lists only (the app ships no brand data).
import { afterEach, describe, expect, test } from "vitest";
import { makeServer } from "./domain_helpers.js";
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
    expect(brands.find((b) => b.key === "benjamin-moore")).toMatchObject({ feed: false, enabled: false, paintCount: 0 });
    expect(brands.find((b) => b.key === "behr")).toMatchObject({ feed: true });
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

  test("a brand with no public list says to import a file; a failed load is recorded", async () => {
    s = makeServer({ fetch: fakeFetch });
    const r = await s.json("POST", "/v1/brands/benjamin-moore/load");
    expect(r.status).toBe(409);
    expect((await r.json()).type).toMatch(/no-public-list$/);
    expect((await s.json("POST", "/v1/brands/nope/load")).status).toBe(404);
    s.close();
    s = makeServer(); // offline: the default fetch answers 503
    const failed = await s.settle((await (await s.json("POST", "/v1/brands/behr/load")).json()).id);
    expect(failed.state).toBe("error");
    const behr = (await (await s.app.request("/v1/brands")).json()).find((b) => b.key === "behr");
    expect(behr.lastError).toBeTruthy();
    expect(behr.paintCount).toBe(0);
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

  test("search by name or code, paged; its query is checked", async () => {
    const rows = await withPalette();
    const page = await (await s.app.request("/v1/paints?q=Test 1&limit=5")).json();
    expect(page.rows).toHaveLength(5);
    expect(page.total).toBeGreaterThan(5);
    expect((await (await s.app.request(`/v1/paints?q=${rows[0].code}`)).json()).rows[0].code).toBe(rows[0].code);
    expect((await s.app.request("/v1/paints?limit=0")).status).toBe(422);
    expect((await (await s.app.request("/v1/paints?q=%25")).json()).total).toBe(0); // a % is a character, not a wildcard
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
