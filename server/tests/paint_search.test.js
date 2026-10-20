// SPDX-License-Identifier: MIT
// GET /v1/paints?q= — the search folds accents on both sides (NFD without its combining marks):
// "cafe" finds "Parisian Cafè", "creme" "Crème De Caramel", and an accent typed finds the name
// without one. On a synthetic list (the app ships no brand data).
import { afterEach, expect, test } from "vitest";
import { folded, searchPaints } from "../src/database/paints.js";
import { makeServer } from "./domain_helpers.js";

let s;
afterEach(() => s?.close());

async function withNames(names) {
  s = makeServer();
  const csv = ["code,name,hex,exterior", ...names.map((n, i) => `T-${i + 1},${n},#a0${String(10 + i).padStart(2, "0")}80,yes`)].join("\n");
  const form = new FormData();
  form.append("file", new Blob([csv]), "behr-test.csv");
  form.append("brand", "behr");
  expect((await s.app.request("/v1/paints/import", { method: "POST", body: form })).status).toBe(201);
}
const names = async (q) => (await (await s.app.request(`/v1/paints?q=${encodeURIComponent(q)}`)).json()).rows.map((p) => p.name).sort();

test("search ignores accents, both ways, and case", async () => {
  await withNames(["Parisian Cafè", "Crème De Caramel", "Naïve Blue", "Plain Gray", "Écru Linen"]);
  expect(await names("cafe")).toEqual(["Parisian Cafè"]);
  expect(await names("creme")).toEqual(["Crème De Caramel"]);
  expect(await names("CRÈME")).toEqual(["Crème De Caramel"]);
  expect(await names("naive")).toEqual(["Naïve Blue"]);
  expect(await names("ECRU")).toEqual(["Écru Linen"]);
  // an accent typed finds the name written without it
  expect(await names("gráy")).toEqual(["Plain Gray"]);
  // a % is still a character, not a wildcard
  expect(await names("%")).toEqual([]);
});

test("the fold: the canonical decomposition without its combining marks, lower case", () => {
  expect(folded("Parisian Cafè")).toBe("parisian cafe");
  // a precomposed é and an e with a combining accent are the same
  expect(folded("Crème")).toBe(folded("Crème"));
  expect(folded(null)).toBe("");
  // the store's search registers its fold() once per connection
  s = makeServer();
  expect(searchPaints(s.db, { q: "x" }).total).toBe(0);
  expect(searchPaints(s.db, { q: "y" }).total).toBe(0);
});
