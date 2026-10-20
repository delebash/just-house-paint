// SPDX-License-Identifier: MIT
// Outlines land whole (parts_api's saveMasks, 2026-10-20): each file is written beside its place and renamed
// in only once every one is written — a disk that fills on the second outline leaves the first as it was (a
// write in place truncated it, and an unreadable outline then failed the house's every Box). The disk is a
// stand-in: node:fs's writeFileSync, failing for outlines past a count; and its renameSync, refusing an
// outline's rename a few times as Windows does while another program (an antivirus) reads the file just written.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { maskPath } from "../src/files.js";
import { jpeg, makeServer } from "./domain_helpers.js";

const disk = vi.hoisted(() => ({ fullAfter: Number.POSITIVE_INFINITY, writes: 0, heldRenames: 0 }));
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal();
  const writeFileSync = (file, ...rest) => {
    if (/[\\/]masks[\\/]/.test(String(file)) && ++disk.writes > disk.fullAfter) throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
    return real.writeFileSync(file, ...rest);
  };
  const renameSync = (from, to) => {
    if (String(from).endsWith(".saving") && disk.heldRenames > 0) {
      disk.heldRenames--;
      throw Object.assign(new Error(`EBUSY: resource busy or locked, rename '${from}'`), { code: "EBUSY" });
    }
    return real.renameSync(from, to);
  };
  return { ...real, writeFileSync, renameSync, default: { ...real, writeFileSync, renameSync } };
});

let s;
afterEach(() => {
  s?.close();
  disk.fullAfter = Number.POSITIVE_INFINITY;
  disk.heldRenames = 0;
});

test("a disk that fills while a box's outlines are saved leaves every outline as it was", async () => {
  s = makeServer();
  const house = await (await s.upload(await jpeg(400, 300))).json();
  await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
  const before = { body: readFileSync(maskPath(s.dataDir, house.id, "body")), trim: readFileSync(maskPath(s.dataDir, house.id, "trim")) };
  // the box changes two outlines (the body gives the trim its pixels): the second write finds the disk full
  disk.writes = 0;
  disk.fullAfter = 1;
  const r = await s.json("POST", `/v1/houses/${house.id}/parts/trim/box`, { x0: 10, y0: 10, x1: 14, y1: 14 });
  expect(r.status).toBe(500);
  expect(readFileSync(maskPath(s.dataDir, house.id, "body")).equals(before.body)).toBe(true);
  expect(readFileSync(maskPath(s.dataDir, house.id, "trim")).equals(before.trim)).toBe(true);
  const masks = path.dirname(maskPath(s.dataDir, house.id, "body"));
  expect(readdirSync(masks).filter((f) => f.endsWith(".saving"))).toEqual([]);
  expect(existsSync(masks)).toBe(true);
});

test("an outline another program holds a moment as it is renamed in is saved whole", async () => {
  // an antivirus reading the file just written: Windows refuses the rename for a moment — the save waits for it
  // (the kit's renameHeldSync), where a refused rename left half the outlines saved (2026-10-20, the thirteenth review)
  s = makeServer();
  const house = await (await s.upload(await jpeg(400, 300))).json();
  await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
  const before = { body: readFileSync(maskPath(s.dataDir, house.id, "body")), trim: readFileSync(maskPath(s.dataDir, house.id, "trim")) };
  disk.heldRenames = 2;
  const r = await s.json("POST", `/v1/houses/${house.id}/parts/trim/box`, { x0: 10, y0: 10, x1: 14, y1: 14 });
  expect(r.status).toBe(200);
  expect(disk.heldRenames).toBe(0);
  // both outlines moved in: the trim took the box, the body gave it up
  expect(readFileSync(maskPath(s.dataDir, house.id, "trim")).equals(before.trim)).toBe(false);
  expect(readFileSync(maskPath(s.dataDir, house.id, "body")).equals(before.body)).toBe(false);
  expect(readdirSync(path.dirname(maskPath(s.dataDir, house.id, "body"))).filter((f) => f.endsWith(".saving"))).toEqual([]);
});
