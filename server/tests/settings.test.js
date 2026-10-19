// SPDX-License-Identifier: MIT
// /v1/settings — the app's own settings, a schema per key, seeded (app-structure §16; family
// rule 1). The happy path, a 422 from the schema, and the refusal of a key that isn't a setting.
import { beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb } from "../src/app_state.js";
import { SETTING_DEFAULTS, seedSettings } from "../src/database/seed.js";
import { SETTING_KEYS } from "../src/schemas/settings.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

let client;
beforeEach(async () => {
  client = testClient(await createApp(tmpDir()));
  seedSettings(getDb());
});

test("every setting has a schema and a seeded first value", async () => {
  expect(Object.keys(SETTING_DEFAULTS).sort()).toEqual([...SETTING_KEYS].sort());
  expect((await client.get("/v1/settings")).json()).toEqual(SETTING_DEFAULTS);
});

test("a change is kept, and a reseed never overwrites it", async () => {
  const r = await client.patch("/v1/settings", { json: { "designs.maxPerHouse": 50 } });
  expect(r.statusCode).toBe(200);
  expect(r.json()["designs.maxPerHouse"]).toBe(50);
  expect(seedSettings(getDb())).toBe(0);
  expect((await client.get("/v1/settings")).json()["designs.maxPerHouse"]).toBe(50);
});

test("a value outside its schema is a 422 with the limit", async () => {
  const r = await client.patch("/v1/settings", { json: { "designs.maxPerHouse": 500 } });
  expect(r.statusCode).toBe(422);
  expect(r.json().errors).toEqual([
    { loc: ["body", "designs.maxPerHouse"], msg: "Input should be less than or equal to 200", type: "less_than_equal", ctx: { le: 200 } },
  ]);
  const half = await client.patch("/v1/settings", { json: { "designs.maxPerHouse": 7.5 } });
  expect(half.json().errors[0].type).toBe("int_from_float");
});

test("a key that isn't a setting is refused, and the prefs and tokens are not reachable here", async () => {
  const r = await client.patch("/v1/settings", { json: { auth: { tokens: [] } } });
  expect(r.statusCode).toBe(422);
  expect(r.json().errors[0]).toMatchObject({ loc: ["body", "auth"], type: "extra_forbidden" });
  await client.patch("/v1/prefs", { json: { aiOfferShown: true } });
  expect(Object.keys((await client.get("/v1/settings")).json())).toEqual(SETTING_KEYS);
});

test("a value whose mistake would only show later is refused: the parts, the harmony rules, the compositing, the families", async () => {
  const parts = SETTING_DEFAULTS["finder.parts"].filter((p) => p.key !== "windows");
  const r = await client.patch("/v1/settings", { json: { "finder.parts": parts } });
  expect(r.statusCode).toBe(422);
  expect(r.json().errors[0]).toMatchObject({ loc: ["body", "finder.parts"], msg: expect.stringMatching(/minus names "windows"/) });
  const kinds = await client.patch("/v1/settings", { json: { "schemes.harmony": { ...SETTING_DEFAULTS["schemes.harmony"], kinds: ["warm"] } } });
  expect(kinds.statusCode).toBe(422);
  expect(kinds.json().errors[0].msg).toMatch(/"warm" isn't a scheme kind/);
  const typed = await client.patch("/v1/settings", { json: { "schemes.harmony": { kinds: "classic" } } });
  expect(typed.statusCode).toBe(422);
  const gain = await client.patch("/v1/settings", { json: { "aiphoto.compose": { ...SETTING_DEFAULTS["aiphoto.compose"], gainLimits: 5 } } });
  expect(gain.json().errors[0]).toMatchObject({ loc: ["body", "aiphoto.compose"], msg: expect.stringMatching(/gainLimits/) });
  const unknown = await client.patch("/v1/settings", { json: { "aiphoto.compose": { blend: 1 } } });
  expect(unknown.statusCode).toBe(422);
  const order = SETTING_DEFAULTS["paints.colorOrder"];
  const twice = await client.patch("/v1/settings", { json: { "paints.colorOrder": { ...order, families: [...order.families, { key: "reds", from: 10 }] } } });
  expect(twice.json().errors[0].msg).toMatch(/"reds" is listed twice/);
  // nothing was saved; a right value still is
  expect((await client.get("/v1/settings")).json()["finder.parts"]).toEqual(SETTING_DEFAULTS["finder.parts"]);
  const ok = await client.patch("/v1/settings", { json: { "aiphoto.compose": { featherPx: 3 }, "schemes.harmony": { kinds: ["classic"] } } });
  expect(ok.statusCode).toBe(200);
});
