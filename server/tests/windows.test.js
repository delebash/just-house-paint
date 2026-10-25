// SPDX-License-Identifier: MIT
// Several windows on one server (the eleventh review, 2026-10-20 — two clients driven against the server overwrote
// each other's work unseen): each window's changes counted apart, so the others read again (GET /v1/sync/rev);
// a design's colors and the paints each part has now merged, never rewritten whole; the outlines versioned
// (If-Match, 412) and written one at a time; no stroke saved under a find; the refusals a stale window meets.

import sharp from "sharp";
import { afterEach, describe, expect, test } from "vitest";
import { jpeg, makeServer } from "./domain_helpers.js";

let s;
afterEach(() => s?.close());

const A = { "x-client-id": "window-a" };
const B = { "x-client-id": "window-b" };

/** A request as window `who` (its id, JSON or a PNG body, and an If-Match when given). */
const as = (who, method, url, body, ifMatch) => {
  const headers = { ...who };
  if (ifMatch) headers["if-match"] = ifMatch;
  if (body instanceof Buffer) headers["content-type"] = "image/png";
  else if (body !== undefined) headers["content-type"] = "application/json";
  return s.app.request(url, { method, headers, body: body instanceof Buffer || body === undefined ? body : JSON.stringify(body) });
};
// the count in the opaque rev ("<series>:<count>")
const rev = async (who) => Number((await (await as(who, "GET", "/v1/sync/rev")).json()).rev.split(":")[1]);

/** A display-size outline PNG with rows [from, to) set. */
async function rows(house, from, to) {
  const px = Buffer.alloc(house.displayWidth * house.displayHeight);
  px.fill(255, from * house.displayWidth, to * house.displayWidth);
  return sharp(px, { raw: { width: house.displayWidth, height: house.displayHeight, channels: 1 } }).png().toBuffer();
}

async function houseWithParts() {
  const house = await (await s.upload(await jpeg(400, 300))).json();
  await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
  return (await s.app.request(`/v1/houses/${house.id}`)).json();
}

describe("other windows' changes", () => {
  test("a window's own writes never move its counter; another window's, and a job's end, do", async () => {
    s = makeServer();
    const house = await houseWithParts();
    const [a0, b0] = [await rev(A), await rev(B)];
    expect((await as(A, "PATCH", `/v1/houses/${house.id}`, { name: "Ours" })).status).toBe(200);
    expect(await rev(A)).toBe(a0);
    expect(await rev(B)).toBe(b0 + 1);
    // a refused write is no change
    expect((await as(A, "PATCH", `/v1/houses/${house.id}`, { name: "" })).status).toBe(422);
    expect(await rev(B)).toBe(b0 + 1);
    // a find B starts: its start and its end are B's — A's page reads them, B's own never re-reads for them
    const job = await (await as(B, "POST", `/v1/houses/${house.id}/find-parts`, {}, house.outlines)).json();
    await s.settle(job.id);
    expect(await rev(B)).toBe(b0 + 1);
    expect(await rev(A)).toBe(a0 + 2);
    const answer = await (await as(A, "GET", "/v1/sync/rev")).json();
    expect(answer).toMatchObject({ pollSeconds: 3 });
    expect(typeof answer.epoch).toBe("string");
  });
});

describe("colors from two windows", () => {
  test("a design's colors: each window's parts kept, null takes one off", async () => {
    s = makeServer();
    const house = await houseWithParts();
    const d = await (await as(A, "POST", `/v1/houses/${house.id}/designs`, { name: "Blue", colors: { body: "behr:OLD", trim: "behr:OLD" } })).json();
    expect((await as(A, "PATCH", `/v1/designs/${d.id}`, { colors: { body: "behr:A-BODY" } })).status).toBe(200);
    expect((await as(B, "PATCH", `/v1/designs/${d.id}`, { colors: { trim: "behr:B-TRIM" } })).status).toBe(200);
    expect((await (await s.app.request(`/v1/houses/${house.id}/designs`)).json())[0].colors).toEqual({ body: "behr:A-BODY", trim: "behr:B-TRIM" });
    await as(B, "PATCH", `/v1/designs/${d.id}`, { colors: { trim: null } });
    expect((await (await s.app.request(`/v1/houses/${house.id}/designs`)).json())[0].colors).toEqual({ body: "behr:A-BODY" });
  });

  test("the paint each part has now: PATCH sets only the parts named, PUT the whole map", async () => {
    s = makeServer();
    const house = await houseWithParts();
    await as(A, "PATCH", `/v1/houses/${house.id}/current-paints`, { body: "behr:A" });
    await as(B, "PATCH", `/v1/houses/${house.id}/current-paints`, { trim: "behr:B" });
    expect((await (await s.app.request(`/v1/houses/${house.id}`)).json()).currentPaints).toEqual({ body: "behr:A", trim: "behr:B" });
    await as(B, "PATCH", `/v1/houses/${house.id}/current-paints`, { body: null });
    expect((await (await s.app.request(`/v1/houses/${house.id}`)).json()).currentPaints).toEqual({ trim: "behr:B" });
    await as(A, "PUT", `/v1/houses/${house.id}/current-paints`, { roof: "behr:R" });
    expect((await (await s.app.request(`/v1/houses/${house.id}`)).json()).currentPaints).toEqual({ roof: "behr:R" });
  });

  test("a design deleted in another window is said so, with its id", async () => {
    s = makeServer();
    const house = await houseWithParts();
    const d = await (await as(A, "POST", `/v1/houses/${house.id}/designs`, { name: "Blue" })).json();
    expect((await as(B, "DELETE", `/v1/designs/${d.id}`)).status).toBe(204);
    const r = await as(A, "PATCH", `/v1/designs/${d.id}`, { colors: { body: "behr:X" } });
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ title: "This design isn't here any more", designId: d.id });
  });
});

describe("outlines from two windows", () => {
  test("a stroke made on outlines another window changed since is refused; the current one lands and answers the next version", async () => {
    s = makeServer();
    const house = await houseWithParts();
    const v0 = house.outlines;
    const a = await as(A, "PUT", `/v1/houses/${house.id}/parts/trim/mask`, await rows(house, 0, 10), v0);
    expect(a.status).toBe(200);
    const v1 = (await a.json()).outlines;
    expect(v1).not.toBe(v0);
    expect(a.headers.get("etag")).toBe(v1);
    // B read the house before A's stroke: its stroke is refused, the outline stays A's
    const b = await as(B, "PUT", `/v1/houses/${house.id}/parts/trim/mask`, await rows(house, 50, 60), v0);
    expect(b.status).toBe(412);
    expect(await b.json()).toMatchObject({ title: "This house was changed in another window", houseId: house.id });
    const parts = await (await s.app.request(`/v1/houses/${house.id}/parts`)).json();
    expect(parts.find((p) => p.key === "trim").area).toBe(10 * house.displayWidth);
    // a Box and Find the parts on the old version: refused too
    expect((await as(B, "POST", `/v1/houses/${house.id}/parts/trim/box`, { x0: 0, y0: 0, x1: 20, y1: 20, mode: "add" }, v0)).status).toBe(412);
    expect((await as(B, "POST", `/v1/houses/${house.id}/find-parts`, {}, v0)).status).toBe(412);
    // read again: B's version is the house's
    expect((await (await s.app.request(`/v1/houses/${house.id}`)).json()).outlines).toBe(v1);
    expect((await as(B, "PUT", `/v1/houses/${house.id}/parts/trim/mask`, await rows(house, 50, 60), v1)).status).toBe(200);
  });

  test("a Box and a stroke at once: one lands, the other is refused — never one saved under the other", async () => {
    s = makeServer();
    const house = await houseWithParts();
    const v0 = house.outlines;
    // the finder outlines the box slowly: the stroke comes while it does
    let release;
    const slow = new Promise((r) => {
      release = r;
    });
    const box = s.ctx.finder.box.bind(s.ctx.finder);
    s.ctx.finder = { ...s.ctx.finder, box: async (...args) => (await slow, box(...args)) };
    const boxed = as(A, "POST", `/v1/houses/${house.id}/parts/trim/box`, { x0: 0, y0: 0, x1: 40, y1: 40, mode: "add" }, v0);
    const stroke = await as(B, "PUT", `/v1/houses/${house.id}/parts/body/mask`, await rows(house, 0, 100), v0);
    release();
    const statuses = [stroke.status, (await boxed).status].sort();
    expect(statuses).toEqual([200, 412]);
  });

  test("while the parts are being found, a stroke or a Box from another window is refused", async () => {
    s = makeServer();
    const house = await houseWithParts();
    let release;
    const slow = new Promise((r) => {
      release = r;
    });
    const find = s.ctx.finder.find.bind(s.ctx.finder);
    s.ctx.finder = { ...s.ctx.finder, find: async (...args) => (await slow, find(...args)) };
    const job = await (await as(A, "POST", `/v1/houses/${house.id}/find-parts`, { keepEdited: true }, house.outlines)).json();
    const stroke = await as(B, "PUT", `/v1/houses/${house.id}/parts/trim/mask`, await rows(house, 0, 10), house.outlines);
    expect(stroke.status).toBe(409);
    expect(await stroke.json()).toMatchObject({ title: "The parts are being found" });
    expect((await as(B, "POST", `/v1/houses/${house.id}/parts/trim/box`, { x0: 0, y0: 0, x1: 20, y1: 20, mode: "add" }, house.outlines)).status).toBe(409);
    // the same choice joins the run; the other choice is refused, not silently joined
    expect((await (await as(B, "POST", `/v1/houses/${house.id}/find-parts`, { keepEdited: true }, house.outlines)).json()).id).toBe(job.id);
    const other = await as(B, "POST", `/v1/houses/${house.id}/find-parts`, { keepEdited: false }, house.outlines);
    expect(other.status).toBe(409);
    expect(await other.json()).toMatchObject({ title: "The parts are already being found" });
    release();
    expect((await s.settle(job.id)).state).toBe("done");
  });
});

describe("the AI photo and the paints another window removed", () => {
  test("a chosen paint no longer loaded is named (409 — a conflict with what is loaded), never left out of the picture", async () => {
    s = makeServer();
    const house = await houseWithParts();
    const form = new FormData();
    form.append("file", new Blob(["code,name,hex\nX-1,Brick Red,#a33a2f"]), "p.csv");
    form.append("brand", "behr");
    await s.app.request("/v1/paints/import", { method: "POST", body: form });
    const r = await s.json("POST", `/v1/houses/${house.id}/aiphoto`, { colors: { body: "behr:X-1", trim: "behr:GONE" } });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ title: "Some colors aren't loaded any more", parts: ["trim"] });
  });

  test("the AI photo waits while AI color schemes run on the local model", async () => {
    s = makeServer();
    const house = await houseWithParts();
    const form = new FormData();
    form.append("file", new Blob(["code,name,hex\nX-1,Brick Red,#a33a2f"]), "p.csv");
    form.append("brand", "behr");
    await s.app.request("/v1/paints/import", { method: "POST", body: form });
    const release = s.ctx.jobs.hold("local-ai", "AI color schemes");
    const r = await s.json("POST", `/v1/houses/${house.id}/aiphoto`, { colors: { body: "behr:X-1" } });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ title: "The graphics card is busy" });
    release();
    expect(s.ctx.jobs.holds.size).toBe(0);
  });
});

describe("outlines.js", () => {
  test("writes for one house run one at a time, in order; other houses don't wait; the version checks strongly", async () => {
    s = makeServer();
    const house = await houseWithParts();
    const { Outlines } = await import("../src/outlines.js");
    const o = new Outlines({ db: s.db });
    const log = [];
    let release;
    const first = o.serial("h1", async () => {
      log.push("h1 first starts");
      await new Promise((r) => {
        release = r;
      });
      log.push("h1 first ends");
    });
    const second = o.serial("h1", async () => log.push("h1 second"));
    await o.serial("h2", async () => log.push("h2"));
    expect(log).toEqual(["h1 first starts", "h2"]);
    release();
    await Promise.all([first, second]);
    expect(log).toEqual(["h1 first starts", "h2", "h1 first ends", "h1 second"]);
    expect(o.held).toBe(0); // the locks go once nothing holds them
    const v0 = o.etag(house.id);
    expect(v0).toBe(house.outlines);
    expect(() => o.check(house.id, v0)).not.toThrow();
    expect(() => o.check(house.id, `W/${v0}`)).toThrow(); // a weak tag never matches (If-Match compares strongly)
    expect(() => o.check(house.id, "*")).not.toThrow();
    expect(() => o.check(house.id, undefined)).not.toThrow(); // unconditional
    await as(A, "PUT", `/v1/houses/${house.id}/parts/trim/mask`, await rows(house, 0, 4), v0);
    const v1 = o.etag(house.id);
    expect(v1).not.toBe(v0);
    expect(() => o.check(house.id, v0)).toThrow(/wasn't saved/);
    expect(() => o.check(house.id, `"x", ${v1}`)).not.toThrow(); // any of a list
  });
});

describe("a server started again", () => {
  test("the outlines' version is the database's: a new process holds the same one; only data writes count; a restart is a change, not a reload", async () => {
    s = makeServer();
    const house = await houseWithParts();
    const { Outlines } = await import("../src/outlines.js");
    const { ChangeCounter } = await import("@delebash/core/platform");
    const { getSetting, setSetting } = await import("../src/database/settings.js");
    // a server started again: the same version, so the page's next stroke lands
    expect(new Outlines({ db: s.db }).etag(house.id)).toBe(house.outlines);
    expect((await as(A, "PUT", `/v1/houses/${house.id}/parts/trim/mask`, await rows(house, 0, 4), house.outlines)).status).toBe(200);
    // the data's epoch is the database's; the rev carries this process's boot id
    const before = await (await as(B, "GET", "/v1/sync/rev")).json();
    const again = new ChangeCounter({ db: s.db, getSetting, setSetting });
    expect(again.epoch).toBe(before.epoch);
    expect(again.boot).not.toBe(before.rev.split(":")[0]);
    // what isn't data: no change
    const n = await rev(B);
    await as(A, "POST", "/v1/schemes/harmony", { brand: "behr", baseHex: "#336699" });
    await as(A, "DELETE", "/v1/jobs/none");
    expect(await rev(B)).toBe(n);
    // the window ids go after a day without a word
    expect(s.ctx.changes.windows).toBeGreaterThan(0);
  });
});

describe("a job that ended while a window slept", () => {
  test("once forgotten, its end is answered 410 with how it ended — only a job the server never had is 404", async () => {
    s = makeServer();
    const job = s.ctx.jobs.start({ kind: "find-parts", key: "h" }, async () => 1);
    await s.settle(job.id);
    s.ctx.jobs.sweep(Date.now() + 11 * 60_000); // past the keep: forgotten
    const r = await s.app.request(`/v1/jobs/${job.id}`);
    expect(r.status).toBe(410);
    expect(await r.json()).toMatchObject({ state: "done", kind: "find-parts" });
    expect((await s.app.request("/v1/jobs/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});
