// SPDX-License-Identifier: MIT
// A restore's own rules for this app's data (data_admin.js checkBackup, run by the kit before anything is replaced),
// and the start's tidy with a house whose id isn't a safe folder name — the nineteenth review (read in the code): a
// restored id that wasn't one made the next start fail (houseDir throws), and restored settings rows were never
// checked against their schemas.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@delebash/core/platform";
import { ZipReader, ZipWriter } from "@delebash/core/platform/zip";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb } from "../src/app_state.js";
import { SETTING_DEFAULTS, seedWorkspace } from "../src/database/seed.js";
import { getSetting } from "../src/database/settings.js";
import { jpeg, makeServer } from "./domain_helpers.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

let client;
beforeEach(async () => {
  client = testClient(await createApp(tmpDir()));
  seedWorkspace(getDb());
});

async function addHouse(name) {
  const form = new FormData();
  form.append("file", new Blob([await jpeg(64, 48)], { type: "image/jpeg" }), "house.jpg");
  form.append("name", name);
  const r = await client.app.request("http://testserver/v1/houses", { method: "POST", body: form, headers: { host: "testserver" } });
  expect(r.status).toBe(201);
  return (await r.json()).id;
}
const names = async () => (await client.get("/v1/houses")).json().map((h) => h.name);

/** This app's backup, its database changed by `change(h)` (the houses' files left out: the rules are the database's). */
async function backupChanged(change) {
  const zip = (await client.get("/v1/data/backup")).rawPayload;
  const dir = mkdtempSync(join(tmpdir(), "hp-rules-"));
  writeFileSync(join(dir, "in.zip"), zip);
  const db = join(dir, "db.sqlite");
  writeFileSync(db, (await ZipReader.open(join(dir, "in.zip"))).read("db.sqlite"));
  const h = openDatabase(db, { foreignKeys: false });
  change(h);
  h.close();
  const out = new ZipWriter();
  await out.addFile(db, "db.sqlite");
  return Buffer.concat(out.finish());
}
function restore(blob) {
  const form = new FormData();
  form.append("file", new Blob([blob], { type: "application/zip" }), "backup.zip");
  return client.app.request("http://testserver/v1/data/restore", { method: "POST", body: form, headers: { host: "testserver" } });
}

test("a backup whose houses hold an id that isn't a safe folder name is refused, nothing replaced", async () => {
  const id = await addHouse("Mine");
  for (const bad of ["../../outside", "a b", "x".repeat(65), "con:1"]) {
    const blob = await backupChanged((h) => h.run("UPDATE houses SET id = ? WHERE id = ?", [bad, id]));
    const r = await restore(blob);
    expect(r.status, bad).toBe(422);
    const body = await r.json();
    expect(body).toMatchObject({ title: "This backup can't be restored", status: 422 });
    expect(body.detail).toMatch(/^its houses include one whose id isn't a safe folder name \(.+\) — this backup can't be restored$/);
    expect(body.errors[0].loc).toEqual(["body", "file"]);
  }
  expect(await names()).toEqual(["Mine"]);
});

test("a backup whose parts or AI photos name a file the app never makes is refused, nothing replaced (the twentieth review)", async () => {
  const id = await addHouse("Mine");
  const cases = [
    (h) => h.run("INSERT INTO parts (house_id, key, paintable, area, score, source, position, updated_at) VALUES (?, '../x', 1, 0, 0, 'added', 0, '')", [id]),
    (h) => h.run("INSERT INTO renders (id, house_id, file, engine, created_at) VALUES ('r1', ?, '../../outside.png', 'x', '')", [id]),
  ];
  for (const change of cases) {
    const r = await restore(await backupChanged(change));
    expect(r.status).toBe(422);
    expect((await r.json()).detail).toMatch(/isn't (a safe file name|one the app makes) \(.+\) — this backup can't be restored$/);
  }
  expect(await names()).toEqual(["Mine"]);
});

// overruled (the coordinator, 2026-10-20): a backup from an older version must restore — the help promises it gets this
// version's settings at once. A row that doesn't fit today's schema is set back to its default, the rest restored, and
// the answer names the keys (the kit's DataManagement says so after the reload)
test("a backup's settings rows that don't fit this version are set back to their defaults, named in the answer; the rest restored", async () => {
  const id = await addHouse("Kept");
  const blob = await backupChanged((h) => {
    h.run("UPDATE settings SET value = ? WHERE key = ?", [JSON.stringify(0.9), "finder.houseMargin"]); // out of today's range (max 0.2)
    h.run("UPDATE settings SET value = ? WHERE key = ?", ["{not json", "photos.jpegQuality"]); // unreadable
    h.run("UPDATE settings SET value = ? WHERE key = ?", [JSON.stringify(12), "designs.maxPerHouse"]); // fits: kept as the backup has it
    // the Settings screen's own checks (the twentieth review): no kind at all; a minus naming a part not in the list;
    // a number JSON can't say again (1e400 is Infinity, read back as null)
    h.run("UPDATE settings SET value = ? WHERE key = ?", [JSON.stringify({ ...SETTING_DEFAULTS["schemes.harmony"], kinds: [] }), "schemes.harmony"]);
    const parts = structuredClone(SETTING_DEFAULTS["finder.parts"]);
    parts.find((p) => p.key === "windowTrim").minus = ["no-such-part"];
    h.run("UPDATE settings SET value = ? WHERE key = ?", [JSON.stringify(parts), "finder.parts"]);
    h.run("UPDATE settings SET value = ? WHERE key = ?", ['{"featherPx": 1e400}', "aiphoto.compose"]);
    h.run("INSERT INTO settings (key, value) VALUES (?, ?)", ["pref.anything", JSON.stringify({ any: "shape" })]); // not a setting
  });
  await addHouse("After the backup");
  const r = await restore(blob);
  expect(r.status).toBe(200);
  const answer = await r.json();
  expect(answer.ok).toBe(true);
  expect([...answer.resetSettings].sort()).toEqual(["aiphoto.compose", "finder.houseMargin", "finder.parts", "photos.jpegQuality", "schemes.harmony"]);
  expect(getSetting(getDb(), "schemes.harmony")).toEqual(SETTING_DEFAULTS["schemes.harmony"]);
  expect(getSetting(getDb(), "finder.parts")).toEqual(SETTING_DEFAULTS["finder.parts"]);
  expect(getSetting(getDb(), "finder.houseMargin")).toBe(SETTING_DEFAULTS["finder.houseMargin"]);
  expect(getSetting(getDb(), "photos.jpegQuality")).toBe(SETTING_DEFAULTS["photos.jpegQuality"]);
  expect(getSetting(getDb(), "designs.maxPerHouse")).toBe(12);
  expect(getSetting(getDb(), "pref.anything")).toEqual({ any: "shape" });
  expect(await names()).toEqual(["Kept"]);
  expect(id).toBeTruthy();
  // this app's own backup: nothing to reset
  const own = await (await restore((await client.get("/v1/data/backup")).rawPayload)).json();
  expect(own).toEqual({ resetSettings: [], ok: true });
});

let s;
afterEach(() => s?.close());

test("the start's tidy skips (and says) a house whose id isn't a safe folder name — the app still starts", async () => {
  s = makeServer();
  const { tidyAtStart } = await import("../src/startup.js");
  const now = new Date().toISOString();
  s.db.run(
    "INSERT INTO houses (id, name, original_file, width, height, display_width, display_height, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ["../evil", "Restored before the rule", "original.jpg", 10, 10, 10, 10, now, now],
  );
  const good = await (await s.upload(await jpeg(100, 80))).json();
  await expect(tidyAtStart(s.dataDir, s.db)).resolves.toBeUndefined();
  // the safe one is still looked after
  expect((await s.app.request(`/v1/houses/${good.id}/image?size=thumb`)).status).toBe(200);
});
