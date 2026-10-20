// SPDX-License-Identifier: MIT
// /v1/houses, /v1/designs, /v1/jobs and the parts routes (app-structure §18: each route's happy
// path, one 422 from its schema, one refusal).
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import sharp from "sharp";
import { afterEach, describe, expect, test, vi } from "vitest";
import { nameFromFile } from "../src/api/houses_api.js";
import { ingestPhoto, isHeic } from "../src/images.js";
import { addRender, createHouse, deleteHouse } from "../src/database/houses.js";
import { tidyAtStart } from "../src/startup.js";
import { addingHouseDir, displayPath, housesRoot, maskPath, removeAllHouseDirs, removeHouseDir, sweepHouseDirs, sweepRenders } from "../src/files.js";
import { fakeFinder, jpeg, LIMITS, makeServer } from "./domain_helpers.js";

let s;
afterEach(() => s?.close());

describe("houses", () => {
  test("adding a photo keeps it and writes the display copy and the thumbnail", async () => {
    s = makeServer();
    const r = await s.upload(await jpeg(800, 600), "front_of-house.jpg");
    expect(r.status).toBe(201);
    const house = await r.json();
    expect(house).toMatchObject({ name: "front of house", width: 800, height: 600, displayWidth: 256, displayHeight: 192, originalFile: "original.jpg" });
    for (const f of ["original.jpg", "display.jpg", "thumb.jpg"]) expect(existsSync(path.join(s.dataDir, "houses", house.id, f))).toBe(true);
    const thumb = await s.app.request(`/v1/houses/${house.id}/image?size=thumb`);
    expect(thumb.headers.get("content-type")).toBe("image/jpeg");
    expect((await sharp(Buffer.from(await thumb.arrayBuffer())).metadata()).width).toBe(64);
    expect((await (await s.app.request("/v1/houses")).json()).map((h) => h.id)).toEqual([house.id]);
  });

  test("a photo with transparency is flattened onto white: the screen, Save image and the AI photo see the same pixels", async () => {
    s = makeServer();
    // left half transparent over a hidden green, right half red
    const px = Buffer.alloc(100 * 80 * 4);
    for (let i = 0; i < 100 * 80; i++) px.set(i % 100 < 50 ? [0, 255, 0, 0] : [200, 30, 30, 255], i * 4);
    const png = await sharp(px, { raw: { width: 100, height: 80, channels: 4 } }).png().toBuffer();
    const house = await (await s.upload(png, "clear.png")).json();
    const original = sharp(readFileSync(path.join(s.dataDir, "houses", house.id, "original.png")));
    expect((await original.metadata()).hasAlpha).toBe(false);
    const { data } = await original.raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]); // white, not the hidden green
    const { data: shown } = await sharp(readFileSync(displayPath(s.dataDir, house.id))).raw().toBuffer({ resolveWithObject: true });
    expect(shown[0]).toBeGreaterThan(240); // and the screen copy agrees (it was black)
  });

  test("a photo past the pixel limit says its size, not 'not an image'", async () => {
    s = makeServer();
    // a PNG whose header says 20000 × 15000 (300 million pixels; sharp stops at 268)
    const chunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(zlib.crc32(td) >>> 0);
      return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(20000, 0);
    ihdr.writeUInt32BE(15000, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.alloc(10))), chunk("IEND", Buffer.alloc(0))]);
    const r = await s.upload(png, "huge.png");
    expect(r.status).toBe(413);
    expect((await r.json()).detail).toMatch(/300 million pixels \(20000 × 15000\); the most is 268 million/);
  });

  test("a name can be given; a sideways phone photo is turned upright", async () => {
    s = makeServer();
    const sideways = await sharp(await jpeg(600, 400)).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const house = await (await s.upload(sideways, "x.jpg", "  Our cottage ")).json();
    expect(house).toMatchObject({ name: "Our cottage", width: 400, height: 600 });
  });

  test("what isn't a photo is refused, and so is a missing or too-large file", async () => {
    s = makeServer();
    const notPhoto = await s.upload(Buffer.from("hello"), "notes.txt");
    expect(notPhoto.status).toBe(415);
    expect((await notPhoto.json()).type).toBe("https://just-house-paint.local/errors/not-a-photo");
    const missing = await s.app.request("/v1/houses", { method: "POST", body: new FormData() });
    expect(missing.status).toBe(422);
    expect((await missing.json()).errors[0].loc).toEqual(["body", "file"]);
    const big = await s.upload(Buffer.alloc(2_000_001, 1), "huge.jpg");
    expect(big.status).toBe(413);
    // far over: refused while it streams in (uploadLimit), before the form is read whole
    const huge = await s.upload(Buffer.alloc(3_000_000, 1), "huge.jpg");
    expect(huge.status).toBe(413);
    expect(await huge.json()).toMatchObject({ type: "https://just-house-paint.local/errors/photo-too-large", detail: "the upload is over 2 MB" });
    // nothing was left behind
    expect((await (await s.app.request("/v1/houses")).json()).length).toBe(0);
  });

  test("rename checks its schema; delete removes the files; an unknown house is a 404", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(100, 80))).json();
    expect((await s.json("PATCH", `/v1/houses/${house.id}`, { name: "" })).status).toBe(422);
    expect((await (await s.json("PATCH", `/v1/houses/${house.id}`, { name: " New name " })).json()).name).toBe("New name");
    expect((await s.app.request(`/v1/houses/${house.id}/image?size=huge`)).status).toBe(422);
    expect((await s.app.request(`/v1/houses/${house.id}`, { method: "DELETE" })).status).toBe(204);
    expect(existsSync(path.join(s.dataDir, "houses", house.id))).toBe(false);
    expect((await s.app.request(`/v1/houses/${house.id}`)).status).toBe(404);
  });

  test("a delete Windows holds still answers 204; its folder goes 30 s later — unless the house came back", async () => {
    let calls = 0;
    s = makeServer({
      removeHouseDir: async () => {
        calls++;
        return false; // held every time
      },
    });
    const gone = await (await s.upload(await jpeg(100, 80))).json();
    const back = await (await s.upload(await jpeg(100, 80))).json();
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      expect((await s.app.request(`/v1/houses/${gone.id}`, { method: "DELETE" })).status).toBe(204);
      expect((await s.app.request(`/v1/houses/${back.id}`, { method: "DELETE" })).status).toBe(204);
      expect(calls).toBe(2);
      // a backup restored meanwhile brings the second house back: its folder must stay
      createHouse(s.db, { id: back.id, name: back.name, originalFile: back.originalFile, width: back.width, height: back.height, displayWidth: back.displayWidth, displayHeight: back.displayHeight });
      vi.advanceTimersByTime(30_000);
      expect(calls).toBe(3); // only the house still gone was tried again
    } finally {
      vi.useRealTimers();
    }
  });

  test("a reset's old houses folder left beside the data (held) goes at the next start", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(100, 80))).json();
    const left = ["houses.removed-1760000000000", "houses.replaced-1760000000001", "houses.restoring-1760000000002"];
    for (const name of left) mkdirSync(path.join(s.dataDir, name, "some-house"), { recursive: true });
    await sweepHouseDirs(s.dataDir, [house.id]);
    for (const name of left) expect(existsSync(path.join(s.dataDir, name))).toBe(false);
    expect(existsSync(displayPath(s.dataDir, house.id))).toBe(true);
  });

  test("no houses folder and a restore's copies beside it: the old (replaced) one goes back, not the backup's", async () => {
    // a restore swaps the folders before its tables: the tables are still the old ones (the twelfth review)
    s = makeServer();
    rmSync(housesRoot(s.dataDir), { recursive: true, force: true });
    const file = (name, ...rest) => path.join(s.dataDir, name, "my-house", ...rest);
    for (const name of ["houses.restoring-1760000000001", "houses.replaced-1760000000001"]) mkdirSync(file(name), { recursive: true });
    writeFileSync(file("houses.replaced-1760000000001", "display.jpg"), "mine");
    writeFileSync(file("houses.restoring-1760000000001", "display.jpg"), "the backup's");
    await sweepHouseDirs(s.dataDir, ["my-house"]);
    expect(readFileSync(path.join(s.dataDir, "houses", "my-house", "display.jpg"), "utf8")).toBe("mine");
    expect(readdirSync(s.dataDir).filter((n) => n.startsWith("houses."))).toEqual([]);
    // only a staged copy left: that one, rather than none
    rmSync(housesRoot(s.dataDir), { recursive: true, force: true });
    mkdirSync(file("houses.restoring-1760000000005"), { recursive: true });
    await sweepHouseDirs(s.dataDir, ["my-house"]);
    expect(existsSync(path.join(s.dataDir, "houses", "my-house"))).toBe(true);
    expect(readdirSync(s.dataDir).filter((n) => n.startsWith("houses."))).toEqual([]);
  });

  test("the start's tidy: a half-written outline a killed save left goes, the outline stays; old work folders go", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(100, 80))).json();
    const { tidyAtStart } = await import("../src/startup.js");
    const { dbPath } = await import("../src/database/index.js");
    const masks = path.join(s.dataDir, "houses", house.id, "masks");
    mkdirSync(masks, { recursive: true });
    writeFileSync(path.join(masks, "body.png"), "whole");
    writeFileSync(path.join(masks, "body.png.saving"), "half");
    const work = path.join(path.dirname(dbPath(s.dataDir)), ".restore-old");
    mkdirSync(work, { recursive: true });
    const hourAgo = new Date(Date.now() - 2 * 3600_000);
    utimesSync(work, hourAgo, hourAgo);
    await tidyAtStart(s.dataDir, s.db);
    expect(readdirSync(masks)).toEqual(["body.png"]);
    expect(existsSync(work)).toBe(false);
  });

  test("a restore the kit couldn't finish yet: the start's tidy touches none of the houses' folders", async () => {
    // its record still beside the database: the copies it names are the only ones (the twelfth review — a failed
    // recovery, then this sweep, removed the user's own houses)
    s = makeServer();
    const { tidyAtStart } = await import("../src/startup.js");
    mkdirSync(path.join(s.dataDir, "houses.replaced-1760000000001", "mine"), { recursive: true });
    mkdirSync(path.join(s.dataDir, "houses", "orphan-half"), { recursive: true });
    const { dbPath } = await import("../src/database/index.js");
    writeFileSync(`${dbPath(s.dataDir)}.restoring`, JSON.stringify({ stamp: 1760000000001, dirs: [] }));
    await tidyAtStart(s.dataDir, s.db);
    expect(existsSync(path.join(s.dataDir, "houses.replaced-1760000000001", "mine"))).toBe(true);
    expect(existsSync(path.join(s.dataDir, "houses", "orphan-half"))).toBe(true);
  });

  test.skipIf(process.platform !== "win32")("a copy Windows holds is copied into place instead of renamed", async () => {
    s = makeServer();
    rmSync(housesRoot(s.dataDir), { recursive: true, force: true });
    mkdirSync(path.join(s.dataDir, "houses.restoring-1760000000001", "h"), { recursive: true });
    mkdirSync(path.join(s.dataDir, "houses.replaced-1760000000001", "h"), { recursive: true });
    const fd = openSync(path.join(s.dataDir, "houses.replaced-1760000000001", "h", "display.jpg"), "w");
    try {
      await sweepHouseDirs(s.dataDir, ["h"]);
    } finally {
      closeSync(fd);
    }
    expect(existsSync(path.join(s.dataDir, "houses", "h", "display.jpg"))).toBe(true);
    expect(existsSync(path.join(s.dataDir, "houses.restoring-1760000000001"))).toBe(false);
    // the start after: what was held beside it goes
    await sweepHouseDirs(s.dataDir, ["h"]);
    expect(readdirSync(s.dataDir).filter((n) => n.startsWith("houses."))).toEqual([]);
  });

  test("a put-back a start couldn't finish is finished at the next — never removed as a leftover", async () => {
    s = makeServer();
    // a photo added since made a new houses folder; the restore's copy is named as still owed
    const added = await (await s.upload(await jpeg(100, 80))).json();
    mkdirSync(path.join(s.dataDir, "houses.restoring-1760000000001", "restored"), { recursive: true });
    writeFileSync(path.join(s.dataDir, "houses.restoring-1760000000001", "restored", "display.jpg"), "the backup's");
    writeFileSync(path.join(s.dataDir, ".houses-put-back"), "houses.restoring-1760000000001");
    await sweepHouseDirs(s.dataDir, [added.id, "restored"]);
    expect(readFileSync(path.join(s.dataDir, "houses", "restored", "display.jpg"), "utf8")).toBe("the backup's");
    expect(existsSync(displayPath(s.dataDir, added.id))).toBe(true); // what it had stays
    expect(readdirSync(s.dataDir).filter((n) => n.startsWith("houses.") || n === ".houses-put-back")).toEqual([]);
  });

  test("a reset takes a restore's leftovers too, and the next start never puts one back as the houses", async () => {
    s = makeServer();
    await s.upload(await jpeg(100, 80));
    mkdirSync(path.join(s.dataDir, "houses.replaced-1000", "old-house"), { recursive: true });
    expect(await removeAllHouseDirs(s.dataDir)).toBe(true);
    expect(readdirSync(s.dataDir).filter((n) => n.startsWith("houses"))).toEqual(["houses"]);
    expect(readdirSync(housesRoot(s.dataDir))).toEqual([]);
  });

  test.skipIf(process.platform !== "win32")("a restore's leftover Windows holds through a reset goes at the next start, never back in place", async () => {
    s = makeServer();
    await s.upload(await jpeg(100, 80));
    mkdirSync(path.join(s.dataDir, "houses.replaced-1000", "old-house"), { recursive: true });
    const fd = openSync(path.join(s.dataDir, "houses.replaced-1000", "old-house", "display.jpg"), "w");
    try {
      await removeAllHouseDirs(s.dataDir);
    } finally {
      closeSync(fd);
    }
    // the next start, no photo added since: the reset's empty houses folder stays; the leftover goes
    await sweepHouseDirs(s.dataDir, []);
    expect(readdirSync(s.dataDir).filter((n) => n.startsWith("houses"))).toEqual(["houses"]);
    expect(readdirSync(housesRoot(s.dataDir))).toEqual([]);
  });

  test("a killed AI photo's picture without a row goes at start, and its day-old work folder", async () => {
    s = makeServer();
    const renders = path.join(s.dataDir, "houses", "h1", "renders");
    mkdirSync(renders, { recursive: true });
    writeFileSync(path.join(renders, "kept.png"), "x");
    writeFileSync(path.join(renders, "half-written.png"), "x");
    const tmp = path.join(s.dataDir, "tmp");
    for (const name of ["aiphoto-old", "aiphoto-now", "someone-else"]) mkdirSync(path.join(tmp, name), { recursive: true });
    const dayAgo = (Date.now() - 25 * 3600_000) / 1000;
    utimesSync(path.join(tmp, "aiphoto-old"), dayAgo, dayAgo);
    expect(await sweepRenders(s.dataDir, new Map([["h1", new Set(["kept.png"])]]), { tmp })).toBe(1);
    expect(readdirSync(renders)).toEqual(["kept.png"]);
    expect(readdirSync(tmp).sort()).toEqual(["aiphoto-now", "someone-else"]); // another copy may be drawing in a new one
  });

  test("the start's tidy keeps every AI photo a row names and takes the one no row names", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(100, 80))).json();
    const renders = path.join(s.dataDir, "houses", house.id, "renders");
    mkdirSync(renders, { recursive: true });
    for (const f of ["kept.png", "half-written.png"]) writeFileSync(path.join(renders, f), "x");
    addRender(s.db, { houseId: house.id, file: "kept.png", engine: "test" });
    await tidyAtStart(s.dataDir, s.db); // exactly what serve.js runs before it listens
    expect(readdirSync(renders)).toEqual(["kept.png"]);
  });

  test("a reset while a photo is read: its files still land, in the new houses folder", async () => {
    s = makeServer();
    addingHouseDir(s.dataDir, "racing");
    let moved = false;
    // the reset moves the houses folder aside after the photo was checked, while it is resized
    const limits = {
      ...LIMITS,
      get displayMax() {
        if (!moved) renameSync(housesRoot(s.dataDir), `${housesRoot(s.dataDir)}.removed-1`);
        moved = true;
        return LIMITS.displayMax;
      },
    };
    expect(await ingestPhoto(await jpeg(100, 80), s.dataDir, "racing", limits)).toMatchObject({ originalFile: "original.jpg" });
    expect(moved).toBe(true);
    for (const f of ["original.jpg", "display.jpg", "thumb.jpg"]) expect(existsSync(path.join(s.dataDir, "houses", "racing", f))).toBe(true);
  });

  test("a photo being added leaves no folder behind if its house never got written", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(100, 80))).json();
    // the server stopped between the photo's files and its house row: the folder is marked "adding"
    addingHouseDir(s.dataDir, "half-added");
    expect(await sweepHouseDirs(s.dataDir, [house.id])).toBe(1);
    expect(existsSync(path.join(s.dataDir, "houses", "half-added"))).toBe(false);
    // a house added in full carries no mark
    expect(existsSync(path.join(s.dataDir, "houses", house.id, ".adding"))).toBe(false);
  });

  test("the add route marks the folder before the photo: a refused add Windows holds leaves it marked", async () => {
    s = makeServer({ removeHouseDir: async () => false }); // the cleanup held
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic", "latin1"), Buffer.alloc(64)]);
    expect((await s.upload(heic, "IMG_0002.HEIC")).status).toBe(415);
    const left = readdirSync(path.join(s.dataDir, "houses"));
    expect(left).toHaveLength(1);
    expect(existsSync(path.join(s.dataDir, "houses", left[0], ".adding"))).toBe(true); // so the next start takes it
    expect(await sweepHouseDirs(s.dataDir, [])).toBe(1);
  });

  test("a reset whose houses folder is held removes the houses one by one", async () => {
    s = makeServer();
    await s.upload(await jpeg(100, 80));
    await s.upload(await jpeg(100, 80));
    const held = () => {
      throw Object.assign(new Error("operation not permitted"), { code: "EPERM" });
    };
    expect(await removeAllHouseDirs(s.dataDir, { rename: held })).toBe(true);
    expect(readdirSync(path.join(s.dataDir, "houses"))).toEqual([]);
    // not even listed (here a file where the folder should be): false, and nothing thrown
    rmSync(housesRoot(s.dataDir), { recursive: true, force: true });
    writeFileSync(housesRoot(s.dataDir), "");
    expect(await removeAllHouseDirs(s.dataDir, { rename: held })).toBe(false);
  });

  test("only a folder a held removal marked is swept at start, and only when its house is gone", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(100, 80))).json();
    const kept = await (await s.upload(await jpeg(100, 80))).json();
    const dir = (name) => path.join(s.dataDir, "houses", name);
    // a deleted house's folder Windows held: marked; a folder with no mark (a database lost or replaced)
    mkdirSync(path.join(dir("gone-house"), "masks"), { recursive: true });
    writeFileSync(path.join(dir("gone-house"), ".removed"), "");
    mkdirSync(dir("unmarked-house"), { recursive: true });
    for (const f of ["original.jpg", "display.jpg", "thumb.jpg"]) writeFileSync(path.join(dir("unmarked-house"), f), "x");
    // v0.1.2's delete that Windows stopped halfway: no mark, part of its photo's copies gone
    mkdirSync(path.join(dir("half-removed"), "masks"), { recursive: true });
    writeFileSync(path.join(dir("half-removed"), "thumb.jpg"), "x");
    // a house restored from a backup after its folder was marked: its row is back, so it stays
    writeFileSync(path.join(dir(kept.id), ".removed"), "");
    expect(await sweepHouseDirs(s.dataDir, [house.id, kept.id])).toBe(2);
    expect(existsSync(dir("gone-house"))).toBe(false);
    expect(existsSync(dir("half-removed"))).toBe(false);
    expect(existsSync(dir("unmarked-house"))).toBe(true); // whole: a lost database's house stays
    expect(existsSync(dir(kept.id))).toBe(true);
    // a folder Windows still holds: false, and marked for the next start's sweep
    const held = async () => {
      throw Object.assign(new Error("operation not permitted"), { code: "EPERM" });
    };
    expect(await removeHouseDir(s.dataDir, house.id, { remove: held })).toBe(false);
    expect(existsSync(path.join(dir(house.id), ".removed"))).toBe(true);
    expect(await removeHouseDir(s.dataDir, house.id)).toBe(true);
    expect(await sweepHouseDirs(path.join(s.dataDir, "nowhere"), [])).toBe(0); // no houses folder yet
  });

  test("the paint each part has now is kept on the house: set, replaced whole, gone with the house", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(100, 80))).json();
    expect(house.currentPaints).toEqual({});
    const url = `/v1/houses/${house.id}/current-paints`;
    const set = await (await s.json("PUT", url, { body: "sherwin-williams:6187", trim: "behr:S1" })).json();
    expect(set.currentPaints).toEqual({ body: "sherwin-williams:6187", trim: "behr:S1" });
    expect(set.name).toBe(house.name); // the rest of the house as it was
    const replaced = await (await s.json("PUT", url, { body: "sherwin-williams:6187" })).json();
    expect(replaced.currentPaints).toEqual({ body: "sherwin-williams:6187" });
    expect((await (await s.app.request(`/v1/houses/${house.id}`)).json()).currentPaints).toEqual({ body: "sherwin-williams:6187" });
    // a rename keeps them; a key that isn't a part name, an empty id or another house is refused
    expect((await (await s.json("PATCH", `/v1/houses/${house.id}`, { name: "Home" })).json()).currentPaints).toEqual({ body: "sherwin-williams:6187" });
    expect((await s.json("PUT", url, { "Not a part!": "x" })).status).toBe(422);
    expect((await s.json("PUT", url, { body: "" })).status).toBe(422);
    expect((await s.json("PUT", "/v1/houses/nope/current-paints", {})).status).toBe(404);
    expect((await s.json("PATCH", `/v1/houses/${house.id}`, {})).status).toBe(422); // a rename still needs its name
    expect((await s.app.request(`/v1/houses/${house.id}`, { method: "DELETE" })).status).toBe(204);
    expect(s.db.all("SELECT * FROM current_paints")).toEqual([]); // ON DELETE CASCADE
  });

  test("a photo's name comes from its file name", () => {
    expect(nameFromFile("C:/photos/my-house_2024.jpeg")).toBe("my house 2024");
    expect(nameFromFile(".jpg")).toBe("My house");
  });
});

describe("parts", () => {
  test("finding parts runs as a job; the masks and the list follow", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(400, 300))).json();
    const started = await s.json("POST", `/v1/houses/${house.id}/find-parts`);
    expect(started.status).toBe(202);
    const job = await started.json();
    // a second start while it runs answers the same job
    expect((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id).toBe(job.id);
    const done = await s.settle(job.id);
    expect(done).toMatchObject({ state: "done", progress: 1, result: { parts: 3 } });
    const parts = await (await s.app.request(`/v1/houses/${house.id}/parts`)).json();
    expect(parts.map((p) => [p.key, p.paintable, p.source])).toEqual([
      ["body", true, "auto"],
      ["trim", true, "auto"],
      ["roof", false, "auto"],
    ]);
    expect(parts[0].area).toBe(256 * 96);
    const mask = await s.app.request(`/v1/houses/${house.id}/parts/body/mask`);
    expect(mask.headers.get("content-type")).toBe("image/png");
    expect((await sharp(Buffer.from(await mask.arrayBuffer())).metadata()).width).toBe(256);
    expect((await (await s.app.request(`/v1/houses/${house.id}`)).json()).partsFoundAt).toBeTruthy();
  });

  test("a house's running jobs are listed, so a page opened or reloaded meanwhile attaches to them", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(400, 300))).json();
    const find = fakeFinder.find;
    let finish;
    fakeFinder.find = function (...args) {
      return new Promise((r) => (finish = () => r(find.apply(this, args))));
    };
    try {
      const job = await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json();
      const listed = await (await s.app.request(`/v1/houses/${house.id}/jobs`)).json();
      expect(listed).toMatchObject([{ id: job.id, kind: "find-parts", state: "running" }]);
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
      finish();
      await s.settle(job.id);
    } finally {
      fakeFinder.find = find;
    }
    expect(await (await s.app.request(`/v1/houses/${house.id}/jobs`)).json()).toEqual([]);
    expect((await s.app.request("/v1/houses/nope/jobs")).status).toBe(404);
  });

  test("a house restored before its parts were found has no masks folder (a backup keeps no empty one): finding them works", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(400, 300))).json();
    rmSync(path.join(s.dataDir, "houses", house.id, "masks"), { recursive: true, force: true });
    expect((await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id)).state).toBe("done");
    expect(existsSync(maskPath(s.dataDir, house.id, "body"))).toBe(true);
    // and a part added by hand to another such house
    const other = await (await s.upload(await jpeg(400, 300))).json();
    rmSync(path.join(s.dataDir, "houses", other.id, "masks"), { recursive: true, force: true });
    expect((await s.json("POST", `/v1/houses/${other.id}/parts`, { key: "fence" })).status).toBe(201);
  });

  test("an outline that can't be read is taken as empty: a Box on the house still works; saves leave no temp file", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(400, 300))).json();
    await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
    writeFileSync(maskPath(s.dataDir, house.id, "roof"), Buffer.from([137, 80, 78, 71])); // cut short
    const r = await s.json("POST", `/v1/houses/${house.id}/parts/trim/box`, { x0: 10, y0: 10, x1: 14, y1: 14 });
    expect(r.status).toBe(200);
    expect(readdirSync(path.join(s.dataDir, "houses", house.id, "masks")).filter((f) => f.endsWith(".saving"))).toEqual([]);
  });

  test("a house deleted while a box was outlined: a 404, and no outline written", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(400, 300))).json();
    await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
    const before = readFileSync(maskPath(s.dataDir, house.id, "trim"));
    const box = fakeFinder.box;
    fakeFinder.box = async function (h, b) {
      deleteHouse(s.db, h.id); // another tab deleted it meanwhile (its folder goes after its row)
      return box.call(this, h, b);
    };
    try {
      expect((await s.json("POST", `/v1/houses/${house.id}/parts/trim/box`, { x0: 10, y0: 10, x1: 14, y1: 14 })).status).toBe(404);
    } finally {
      fakeFinder.box = box;
    }
    expect(readFileSync(maskPath(s.dataDir, house.id, "trim")).equals(before)).toBe(true);
  });

  test("a box moves what's inside it into the part; remove takes it out", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(400, 300))).json();
    await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
    const add = await (await s.json("POST", `/v1/houses/${house.id}/parts/trim/box`, { x0: 10, y0: 10, x1: 14, y1: 14 })).json();
    expect(add.changed.sort()).toEqual(["body", "trim"]);
    const byKey = Object.fromEntries(add.parts.map((p) => [p.key, p]));
    expect(byKey.trim.area).toBe(128 * 96 + 16);
    expect(byKey.body.area).toBe(256 * 96 - 16);
    expect(byKey.trim.source).toBe("edited");
    const remove = await (await s.json("POST", `/v1/houses/${house.id}/parts/trim/box`, { x0: 10, y0: 10, x1: 14, y1: 14, mode: "remove" })).json();
    expect(remove.changed).toEqual(["trim"]);
    expect((await s.json("POST", `/v1/houses/${house.id}/parts/trim/box`, { x0: 0, y0: 0, x1: 9999, y1: 5 })).status).toBe(422);
    expect((await s.json("POST", `/v1/houses/${house.id}/parts/trim/box`, { x0: -1, y0: 1, x1: 5, y1: 5 })).status).toBe(422);
    expect((await s.json("POST", `/v1/houses/${house.id}/parts/trim/box`, { x0: 5, y0: 5, x1: 6, y1: 9 })).status).toBe(422);
    expect((await s.json("POST", `/v1/houses/${house.id}/parts/porch/box`, { x0: 1, y0: 1, x1: 5, y1: 5 })).status).toBe(404);
  });

  test("the brush's mask is stored; a part can be added by hand", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(400, 300))).json();
    await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
    const added = await s.json("POST", `/v1/houses/${house.id}/parts`, { key: "shutters" });
    expect(added.status).toBe(201);
    expect(await added.json()).toMatchObject({ key: "shutters", area: 0, source: "added", paintable: true });
    expect((await s.json("POST", `/v1/houses/${house.id}/parts`, { key: "shutters" })).status).toBe(409);
    expect((await s.json("POST", `/v1/houses/${house.id}/parts`, { key: "Bad Key" })).status).toBe(422);
    // a half-size PNG with its left half set is scaled to the display size
    const px = Buffer.alloc(128 * 96);
    for (let y = 0; y < 96; y++) px.fill(255, y * 128, y * 128 + 64);
    const png = await sharp(px, { raw: { width: 128, height: 96, channels: 1 } }).png().toBuffer();
    const put = await s.app.request(`/v1/houses/${house.id}/parts/shutters/mask`, { method: "PUT", headers: { "content-type": "image/png" }, body: png });
    expect(put.status).toBe(200);
    expect((await put.json()).area).toBeGreaterThan(256 * 192 * 0.45);
    expect((await s.app.request(`/v1/houses/${house.id}/parts/shutters/mask`, { method: "PUT", headers: { "content-type": "text/plain" }, body: "x" })).status).toBe(422);
  });

  test("finding again keeps the parts changed by hand when asked, the found ones cut around them", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(400, 300))).json();
    await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
    // the brush gives the trim the photo's top ten rows (the finder put them in the body)
    const px = Buffer.alloc(256 * 192);
    px.fill(255, 0, 256 * 10);
    const png = await sharp(px, { raw: { width: 256, height: 192, channels: 1 } }).png().toBuffer();
    await s.app.request(`/v1/houses/${house.id}/parts/trim/mask`, { method: "PUT", headers: { "content-type": "image/png" }, body: png });
    await s.json("POST", `/v1/houses/${house.id}/parts`, { key: "shutters" });
    const kept = await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`, { keepEdited: true })).json()).id);
    expect(kept.result).toMatchObject({ parts: 4, kept: 2 });
    const list = async () => (await (await s.app.request(`/v1/houses/${house.id}/parts`)).json()).map((p) => [p.key, p.source, p.area]);
    // the body is cut around the kept trim; what the finder called trim this time and the kept one hasn't
    // (the bottom-left quarter) goes to the body where it lies on the house (the left quarter: 64 × 96) —
    // never what reaches past the house
    expect(await list()).toEqual([
      ["body", "auto", 256 * 86 + 64 * 96],
      ["trim", "edited", 256 * 10],
      ["roof", "auto", 0],
      ["shutters", "added", 0],
    ]);
    // without it, every part is found again and the one made by hand goes
    await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
    expect(await list()).toEqual([
      ["body", "auto", 256 * 96],
      ["trim", "auto", 128 * 96],
      ["roof", "auto", 0],
    ]);
    expect((await s.app.request(`/v1/houses/${house.id}/parts/shutters/mask`)).status).toBe(404);
    expect((await s.json("POST", `/v1/houses/${house.id}/find-parts`, { keepEdited: [] })).status).toBe(422);
  });

  test("a failing finder ends the job in error, and cancel stops it", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(100, 80))).json();
    const original = fakeFinder.find;
    fakeFinder.find = async () => {
      throw new Error("the model file is damaged");
    };
    try {
      const failed = await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
      expect(failed.state).toBe("error");
      expect(failed.error.message).toBe("the model file is damaged");
      fakeFinder.find = (h, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      const job = await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json();
      expect((await s.app.request(`/v1/jobs/${job.id}`, { method: "DELETE" })).status).toBe(200);
      expect((await s.settle(job.id)).state).toBe("cancelled");
      expect((await s.app.request("/v1/jobs/nope")).status).toBe(404);
    } finally {
      fakeFinder.find = original;
    }
  });
});

describe("designs", () => {
  test("save, rename, recolor, refuse a duplicate name, delete", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(100, 80))).json();
    const url = `/v1/houses/${house.id}/designs`;
    const made = await s.json("POST", url, { name: " Classic ", colors: { body: "sw:7008", trim: null } });
    expect(made.status).toBe(201);
    const d = await made.json();
    expect(d).toMatchObject({ name: "Classic", colors: { body: "sw:7008" } });
    // a name another design has: the name field's own error (§15), worded for the person
    const taken = await s.json("POST", url, { name: "classic" });
    expect(taken.status).toBe(422);
    expect((await taken.json()).errors[0]).toMatchObject({ loc: ["body", "name"], msg: "This house already has a design named “classic”." });
    expect((await s.json("POST", url, { name: "" })).status).toBe(422);
    // a key that isn't a part name is refused (the record's pattern, additionalProperties: false)
    expect((await s.json("POST", url, { name: "x", colors: { "Bad Key": "a" } })).status).toBe(422);
    const patched = await (await s.json("PATCH", `/v1/designs/${d.id}`, { colors: { body: "behr:PPU7-12", door: "sw:6258" } })).json();
    expect(patched.colors).toEqual({ body: "behr:PPU7-12", door: "sw:6258" });
    expect(patched.name).toBe("Classic");
    await s.json("POST", url, { name: "Two" });
    await s.json("POST", url, { name: "Three" });
    const full = await s.json("POST", url, { name: "Four" }); // the limit is a setting: 3 here
    expect(full.status).toBe(409);
    expect(await full.json()).toMatchObject({ title: "This house has all the designs it can keep" });
    expect((await s.app.request(`/v1/designs/${d.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await s.json("PATCH", `/v1/designs/${d.id}`, { name: "x" })).status).toBe(404);
    expect((await (await s.app.request(url)).json()).map((x) => x.name)).toEqual(["Two", "Three"]);
  });

  test("deleting a house deletes its designs and parts", async () => {
    s = makeServer();
    const house = await (await s.upload(await jpeg(100, 80))).json();
    await s.json("POST", `/v1/houses/${house.id}/designs`, { name: "A", colors: { body: "x:1" } });
    await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
    await s.app.request(`/v1/houses/${house.id}`, { method: "DELETE" });
    expect(s.db.value("SELECT count(*) FROM designs")).toBe(0);
    expect(s.db.value("SELECT count(*) FROM design_colors")).toBe(0);
    expect(s.db.value("SELECT count(*) FROM parts")).toBe(0);
  });
});

test("a name of only spaces is refused; a photo whose pixels can't be read is a 415, not a 500", async () => {
  s = makeServer();
  const house = await (await s.upload(await jpeg(64, 48))).json();
  const blank = await s.json("PATCH", `/v1/houses/${house.id}`, { name: "   " });
  expect(blank.status).toBe(422);
  expect((await s.json("POST", `/v1/houses/${house.id}/designs`, { name: "  " })).status).toBe(422);
  // an iPhone's HEIC photo (an ftyp box naming an HEVC brand): its own words, not "not an image"
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic", "latin1"), Buffer.alloc(64)]);
  const refused = await s.upload(heic, "IMG_0001.HEIC");
  expect(refused.status).toBe(415);
  expect((await refused.json()).detail).toMatch(/HEIC photo can't be read here .* JPEG/);
  // a generic HEIF brand is HEIC only when it lists an HEVC brand (an AVIF with mif1 isn't)
  const brands = (major, ...compatible) => {
    const body = Buffer.from(`ftyp${major}\0\0\0\0${compatible.join("")}`, "latin1");
    const size = Buffer.alloc(4);
    size.writeUInt32BE(body.length + 4);
    return Buffer.concat([size, body]);
  };
  expect(isHeic(brands("mif1", "mif1", "heic"))).toBe(true);
  expect(isHeic(brands("mif1", "mif1", "avif"))).toBe(false);
  expect(isHeic(brands("avif", "mif1", "miaf"))).toBe(false);
  expect(isHeic(brands("isom", "mp41"))).toBe(false); // a video
  // a JPEG cut off part-way: its header reads, its pixels don't
  const whole = await jpeg(640, 480);
  const cut = await s.upload(whole.subarray(0, Math.floor(whole.length / 3)));
  expect(cut.status).toBe(415);
  expect((await (await s.app.request("/v1/houses")).json()).map((h) => h.id)).toEqual([house.id]);
});

test("finding the parts again removes the outlines of parts not found this time", async () => {
  s = makeServer();
  const house = await (await s.upload(await jpeg(64, 48))).json();
  await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
  expect((await s.json("POST", `/v1/houses/${house.id}/parts`, { key: "shed" })).status).toBe(201);
  await s.app.request(`/v1/houses/${house.id}/parts/shed/mask`, { method: "PUT", headers: { "content-type": "image/png" }, body: await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).png().toBuffer() });
  const file = maskPath(s.dataDir, house.id, "shed");
  expect(existsSync(file)).toBe(true);
  await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
  expect(existsSync(file)).toBe(false);
});

test("deleting a house stops its running work", async () => {
  s = makeServer();
  const house = await (await s.upload(await jpeg(64, 48))).json();
  const job = s.ctx.jobs.start({ kind: "find-parts", key: house.id }, ({ signal }) =>
    new Promise((_, no) => {
      const stop = () => no(Object.assign(new Error("x"), { name: "AbortError" }));
      if (signal.aborted) stop();
      else signal.addEventListener("abort", stop);
    }),
  );
  expect((await s.app.request(`/v1/houses/${house.id}`, { method: "DELETE" })).status).toBe(204);
  expect((await s.settle(job.id)).state).toBe("cancelled");
});
