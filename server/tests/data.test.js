// SPDX-License-Identifier: MIT
// Settings → Backups' server half (data_admin.js over the kit's makeDataRouter): a backup is a ZIP
// of the database and the houses' files, a restore puts both back, a reset returns the first-run
// state — keeping the access tokens, so a reset never opens an exposed server.
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openDatabase } from "@delebash/core/platform";
import { ZipReader, ZipWriter } from "@delebash/core/platform/zip";
import { beforeEach, expect, test, vi } from "vitest";
import { createApp } from "../src/app.js";
import { getDb, getState } from "../src/app_state.js";
import { seedWorkspace } from "../src/database/seed.js";
import { deleteSetting, getSetting } from "../src/database/settings.js";
import { displayPath, housesRoot } from "../src/files.js";
import { jpeg } from "./domain_helpers.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

// what the reset had put back when it began removing the houses' files (the slow, yielding part)
const atRemoval = vi.hoisted(() => ({ auth: undefined, seeded: undefined }));
vi.mock("../src/files.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    async removeAllHouseDirs(...args) {
      const { getDb: db } = await import("../src/app_state.js");
      const { getSetting: read } = await import("../src/database/settings.js");
      atRemoval.auth = read(db(), "auth");
      atRemoval.seeded = read(db(), "designs.maxPerHouse");
      return real.removeAllHouseDirs(...args);
    },
  };
});

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

test("a restore and a reset are every window's change: their counters move, the outline versions start again", async () => {
  // the eleventh review (2026-10-20): the other windows read again after the data was replaced, and a stroke made
  // on outlines read before it is refused (412), never saved over the restored ones
  const id = await addHouse("Before the backup");
  const rev = async (who) => (await client.get("/v1/sync/rev", { headers: { "x-client-id": who } })).json();
  const backup = await client.get("/v1/data/backup");
  const before = { a: await rev("a"), b: await rev("b"), outlines: (await client.get(`/v1/houses/${id}`)).json().outlines };
  const form = new FormData();
  form.append("file", new Blob([backup.rawPayload], { type: "application/zip" }), "backup.zip");
  // window "a" restores: its own counter moves too — everything changed
  const restored = await client.app.request("http://testserver/v1/data/restore", { method: "POST", body: form, headers: { host: "testserver", "x-client-id": "a" } });
  expect(restored.status).toBe(200);
  const after = { a: await rev("a"), b: await rev("b") };
  expect(after.a.rev).toBeGreaterThan(before.a.rev);
  expect(after.b.rev).toBeGreaterThan(before.b.rev);
  expect(after.b.epoch).not.toBe(before.b.epoch);
  expect((await client.get(`/v1/houses/${id}`)).json().outlines).not.toBe(before.outlines);
  // the same for a reset
  expect((await client.post("/v1/data/reset", { headers: { "x-client-id": "a" } })).statusCode).toBe(200);
  expect((await rev("b")).rev).toBeGreaterThan(after.b.rev);
});

test("reset returns the first-run state but keeps the access tokens", async () => {
  await addHouse("Gone after reset");
  await client.patch("/v1/settings", { json: { "designs.maxPerHouse": 60 } });
  await client.patch("/v1/prefs", { json: { aiOfferShown: true } });
  await client.put("/v1/server-auth", { json: { tokens: ["still-here"] } });
  const auth = { headers: { authorization: "Bearer still-here" } };

  expect((await client.post("/v1/data/reset", auth)).statusCode).toBe(200);
  expect((await client.get("/v1/houses", auth)).json()).toEqual([]);
  expect(readdirSync(housesRoot(getState().dataDir))).toEqual([]); // the houses' files went too (an empty folder left)
  // moved aside first, then removed: nothing of it is left beside the data
  expect(readdirSync(getState().dataDir).filter((n) => n.startsWith("houses."))).toEqual([]);
  expect((await client.get("/v1/settings", auth)).json()["designs.maxPerHouse"]).toBe(30); // reseeded
  expect((await client.get("/v1/prefs", auth)).json()).toEqual({});
  expect(getSetting(getDb(), "auth").tokens).toEqual(["still-here"]);
  // the tokens and the seed were back before the files' removal began (other requests run meanwhile)
  expect(atRemoval.auth?.tokens).toEqual(["still-here"]);
  expect(atRemoval.seeded).toBe(30);
  // the AI stack was reseeded too
  expect((await client.get("/v1/llm-providers", auth)).json().providers.length).toBeGreaterThan(0);
});

test("a restore keeps this server's access tokens — never the backup's", async () => {
  const restore = async (zip, headers = {}) => {
    const form = new FormData();
    form.append("file", new Blob([zip], { type: "application/zip" }), "backup.zip");
    return client.app.request("http://testserver/v1/data/restore", { method: "POST", body: form, headers: { host: "testserver", ...headers } });
  };
  // a backup from before a token was set: restored, the server stays closed with its own token
  const noToken = (await client.get("/v1/data/backup")).rawPayload;
  await client.put("/v1/server-auth", { json: { tokens: ["mine"] } });
  const auth = { authorization: "Bearer mine" };
  expect((await restore(noToken, auth)).status).toBe(200);
  expect(getSetting(getDb(), "auth").tokens).toEqual(["mine"]);
  // a backup that carries a token (v0.1.2's did — ours are scrubbed, below), restored on a server without one:
  // no token of the backup's comes with it
  const withToken = await rawBackup();
  deleteSetting(getDb(), "auth");
  expect((await restore(withToken)).status).toBe(200);
  expect(getSetting(getDb(), "auth")).toBeUndefined();
  // this version's backups carry no token at all
  await client.put("/v1/server-auth", { json: { tokens: ["mine"] } });
  const dir = tmpDir();
  writeFileSync(join(dir, "ours.zip"), (await client.get("/v1/data/backup", { headers: auth })).rawPayload);
  await (await ZipReader.open(join(dir, "ours.zip"))).extractAll(join(dir, "out"));
  const copy = openDatabase(join(dir, "out", "db.sqlite"), { foreignKeys: false });
  expect(getSetting(copy, "auth")).toBeUndefined();
  copy.close();
});

/** A backup as an older version made it: the database as it is — its access tokens in it — zipped. */
async function rawBackup() {
  const dir = tmpDir();
  getDb().run("VACUUM INTO ?", [join(dir, "db.sqlite")]);
  const zip = new ZipWriter();
  await zip.addFile(join(dir, "db.sqlite"), "db.sqlite");
  return Buffer.concat(zip.finish());
}

test("a backup from an older version gets this one's settings seed when restored, not only at the next start", async () => {
  deleteSetting(getDb(), "designs.maxPerHouse"); // a setting the older version didn't have
  const old = (await client.get("/v1/data/backup")).rawPayload;
  seedWorkspace(getDb());
  const form = new FormData();
  form.append("file", new Blob([old], { type: "application/zip" }), "backup.zip");
  expect((await client.app.request("http://testserver/v1/data/restore", { method: "POST", body: form, headers: { host: "testserver" } })).status).toBe(200);
  expect(getSetting(getDb(), "designs.maxPerHouse")).toBe(30);
});

test("a restore of something that isn't a backup is refused", async () => {
  const form = new FormData();
  form.append("file", new Blob(["not a zip"]), "backup.zip");
  const r = await client.app.request("http://testserver/v1/data/restore", { method: "POST", body: form, headers: { host: "testserver" } });
  expect(r.status).toBe(400);
});
