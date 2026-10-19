// SPDX-License-Identifier: MIT
// /v1/houses, /v1/designs, /v1/jobs and the parts routes (app-structure §18: each route's happy
// path, one 422 from its schema, one refusal).
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, test } from "vitest";
import { nameFromFile } from "../src/api/houses_api.js";
import { maskPath } from "../src/files.js";
import { fakeFinder, jpeg, makeServer } from "./domain_helpers.js";

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
    expect((await s.json("POST", url, { name: "classic" })).status).toBe(409);
    expect((await s.json("POST", url, { name: "" })).status).toBe(422);
    // a key that isn't a part name is refused (the record's pattern, additionalProperties: false)
    expect((await s.json("POST", url, { name: "x", colors: { "Bad Key": "a" } })).status).toBe(422);
    const patched = await (await s.json("PATCH", `/v1/designs/${d.id}`, { colors: { body: "behr:PPU7-12", door: "sw:6258" } })).json();
    expect(patched.colors).toEqual({ body: "behr:PPU7-12", door: "sw:6258" });
    expect(patched.name).toBe("Classic");
    await s.json("POST", url, { name: "Two" });
    await s.json("POST", url, { name: "Three" });
    expect((await s.json("POST", url, { name: "Four" })).status).toBe(409); // the limit is a setting: 3 here
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
