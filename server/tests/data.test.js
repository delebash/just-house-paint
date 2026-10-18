// SPDX-License-Identifier: MIT
// Settings → Backups' server half (data_admin.js over the kit's makeDataRouter): a backup is a ZIP
// of the database and the houses' files, a restore puts both back, a reset returns the first-run
// state — keeping the access tokens, so a reset never opens an exposed server.
import { existsSync } from "node:fs";
import { beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb, getState } from "../src/app_state.js";
import { seedWorkspace } from "../src/database/seed.js";
import { getSetting } from "../src/database/settings.js";
import { displayPath, housesRoot } from "../src/files.js";
import { jpeg } from "./domain_helpers.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

let client;
beforeEach(async () => {
  client = testClient(await createApp(tmpDir()));
  seedWorkspace(getDb());
});

/** Add a house from a small photo; its id. */
async function addHouse(name) {
  const form = new FormData();
  form.append("file", new Blob([await jpeg(64, 48)], { type: "image/jpeg" }), "house.jpg");
  form.append("name", name);
  const r = await client.app.request("http://testserver/v1/houses", { method: "POST", body: form, headers: { host: "testserver" } });
  expect(r.status).toBe(201);
  return (await r.json()).id;
}

const names = async () => (await client.get("/v1/houses")).json().map((h) => h.name);

test("backup, change, restore: the backup's houses and their files come back", async () => {
  const before = await addHouse("Before the backup");
  const backup = await client.get("/v1/data/backup");
  expect(backup.statusCode).toBe(200);
  expect(backup.headers["content-type"]).toBe("application/zip");
  expect(backup.rawPayload.subarray(0, 2).toString()).toBe("PK");

  const after = await addHouse("After the backup");
  expect((await names()).sort()).toEqual(["After the backup", "Before the backup"]);

  const form = new FormData();
  form.append("file", new Blob([backup.rawPayload], { type: "application/zip" }), "backup.zip");
  const restored = await client.app.request("http://testserver/v1/data/restore", { method: "POST", body: form, headers: { host: "testserver" } });
  expect(restored.status).toBe(200);
  expect(await names()).toEqual(["Before the backup"]);
  const { dataDir } = getState();
  expect(existsSync(displayPath(dataDir, before))).toBe(true);
  expect(existsSync(displayPath(dataDir, after))).toBe(false); // the houses folder is the backup's
});

test("reset returns the first-run state but keeps the access tokens", async () => {
  await addHouse("Gone after reset");
  await client.patch("/v1/settings", { json: { "designs.maxPerHouse": 60 } });
  await client.patch("/v1/prefs", { json: { aiOfferShown: true } });
  await client.put("/v1/server-auth", { json: { tokens: ["still-here"] } });
  const auth = { headers: { authorization: "Bearer still-here" } };

  expect((await client.post("/v1/data/reset", auth)).statusCode).toBe(200);
  expect((await client.get("/v1/houses", auth)).json()).toEqual([]);
  expect(existsSync(housesRoot(getState().dataDir))).toBe(false); // the houses' files went too
  expect((await client.get("/v1/settings", auth)).json()["designs.maxPerHouse"]).toBe(30); // reseeded
  expect((await client.get("/v1/prefs", auth)).json()).toEqual({});
  expect(getSetting(getDb(), "auth").tokens).toEqual(["still-here"]);
  // the AI stack was reseeded too
  expect((await client.get("/v1/llm-providers", auth)).json().providers.length).toBeGreaterThan(0);
});

test("a restore of something that isn't a backup is refused", async () => {
  const form = new FormData();
  form.append("file", new Blob(["not a zip"]), "backup.zip");
  const r = await client.app.request("http://testserver/v1/data/restore", { method: "POST", body: form, headers: { host: "testserver" } });
  expect(r.status).toBe(400);
});
