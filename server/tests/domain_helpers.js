// SPDX-License-Identifier: MIT
// A hermetic house-paint server for the route tests: a temp data folder, the app's migrations, the
// house-paint routers on the kit's createServer (without the AI stack — app.test.js boots that),
// and a fake part finder (the real one is tested with the model, tests/segment/real.test.js).
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ChangeCounter, createServer, JobRegistry, makeJobsRouter, makeSyncRevRouter, migrate, openDatabase } from "@delebash/core/platform";
import sharp from "sharp";
import { router as designsRouter } from "../src/api/designs_api.js";
import { router as enginesRouter } from "../src/api/engines_api.js";
import { router as housesRouter } from "../src/api/houses_api.js";
import { router as jobsRouter } from "../src/api/jobs_api.js";
import { router as paintsRouter } from "../src/api/paints_api.js";
import { router as partsRouter } from "../src/api/parts_api.js";
import { router as schemesAiRouter } from "../src/api/schemes_ai_api.js";
import { DATA_WRITES } from "../src/app.js";
import { MIGRATIONS } from "../src/database/schema.js";
import { SETTING_DEFAULTS } from "../src/database/seed.js";
import { getSetting, setSetting } from "../src/database/settings.js";
import { Outlines } from "../src/outlines.js";

export const LIMITS = { displayMax: 256, thumbMax: 64, jpegQuality: 85, maxPhotoBytes: 2_000_000 };

/** A w×h JPEG: the top half `top`, the bottom half `bottom` ([r, g, b]). */
export function jpeg(w, h, top = [220, 220, 210], bottom = [120, 60, 40]) {
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = y < h / 2 ? top : bottom;
      px.set(c, (y * w + x) * 3);
    }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
}

/** A fake finder: "body" is the top half, "trim" the bottom-left quarter; a box selects itself. */
export const fakeFinder = {
  calls: [],
  async find(house, { progress }) {
    const w = house.displayWidth;
    const h = house.displayHeight;
    const body = new Uint8Array(w * h);
    const trim = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (y < h / 2) body[y * w + x] = 255;
        else if (x < w / 2) trim[y * w + x] = 255;
      }
    progress(0.5, "halfway");
    this.calls.push(["find", house.id]);
    return [
      // `house`: the outline the body was cut from — here the photo's left quarter, so the trim lies half off it
      { key: "body", paintable: true, score: 0.9, mask: body, base: true, house: Uint8Array.from({ length: w * h }, (_, i) => (i % w < w / 4 ? 255 : 0)) },
      { key: "trim", paintable: true, score: 0.8, mask: trim },
      { key: "roof", paintable: false, score: 0.7, mask: new Uint8Array(w * h) },
    ];
  },
  async box(house, { x0, y0, x1, y1 }) {
    const w = house.displayWidth;
    const region = new Uint8Array(w * house.displayHeight);
    for (let y = Math.floor(y0); y < Math.floor(y1); y++) for (let x = Math.floor(x0); x < Math.floor(x1); x++) region[y * w + x] = 255;
    this.calls.push(["box", x0, y0, x1, y1]);
    return region;
  },
};

/** `fetch`: the brands' public lists (a fake in tests). */
/** `run`: the AI run path (a fake: answers with `aiAnswer.text`). */
export const aiAnswer = { text: "{}", calls: [], error: null, hang: false, aborted: 0 };
export function makeServer({ fetch = async () => new Response("offline", { status: 503 }), aiphoto = null, sharedGpu = null, removeHouseDir = null, finishes = null } = {}) {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "hp-test-"));
  const db = openDatabase(path.join(dataDir, "app.db"), { foreignKeys: true });
  migrate(db, MIGRATIONS);
  // as services.js and app.js wire them: a job's end is its window's change; each window's writes counted apart
  const changes = new ChangeCounter({ db, writes: DATA_WRITES, getSetting, setSetting });
  const jobs = new JobRegistry({ onFinish: (job) => changes.note(job.clientId) });
  const ctx = { db, dataDir, jobs, changes, outlines: new Outlines({ db }), checkSeconds: () => 3, fetch, finder: fakeFinder, limits: () => LIMITS, maxDesignsPerHouse: () => 3, harmony: () => ({}), maxImportBytes: () => 5_000_000,
    // read as services.js reads it: the row, else the seed's value
    colorOrder: () => getSetting(db, "paints.colorOrder") ?? SETTING_DEFAULTS["paints.colorOrder"],
    finishes: finishes ?? (() => getSetting(db, "paints.finishes") ?? SETTING_DEFAULTS["paints.finishes"]),
    partLabel: (k) => k.replace(/_/g, " "),
    run: async (body, { signal } = {}) => {
      aiAnswer.calls.push(body);
      if (aiAnswer.error) throw aiAnswer.error;
      // `hang`: a model that never answers — until the request's signal aborts it, as the kit's runAction rejects
      if (aiAnswer.hang) {
        await new Promise((_, reject) =>
          signal?.addEventListener("abort", () => {
            aiAnswer.aborted++;
            reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }));
          }),
        );
      }
      return { text: aiAnswer.text, model: "fake-model", prompt_tokens: 120, completion_tokens: 80 };
    } };
  ctx.aiphoto = aiphoto ? aiphoto(ctx) : null;
  if (sharedGpu) ctx.sharedGpu = sharedGpu;
  if (removeHouseDir) ctx.removeHouseDir = removeHouseDir;
  const app = createServer({ typeBase: "https://just-house-paint.local/errors/" });
  app.use("*", changes.middleware());
  for (const r of [makeSyncRevRouter(changes, { pollSeconds: ctx.checkSeconds }), housesRouter(ctx), designsRouter(ctx), makeJobsRouter(jobs), jobsRouter(ctx), partsRouter(ctx), paintsRouter(ctx), schemesAiRouter(ctx), enginesRouter(ctx)]) app.route("/", r);
  const close = () => {
    jobs.cancelAll();
    db.raw.close();
    rmSync(dataDir, { recursive: true, force: true });
  };
  const json = (method, url, body) =>
    app.request(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const upload = async (buffer, filename = "my-house.jpg", name) => {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: "image/jpeg" }), filename);
    if (name) form.append("name", name);
    return app.request("/v1/houses", { method: "POST", body: form });
  };
  /** Poll a job until it leaves "running". */
  const settle = async (jobId) => {
    for (let i = 0; i < 200; i++) {
      const j = await (await app.request(`/v1/jobs/${jobId}`)).json();
      if (j.state !== "running") return j;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("job never finished");
  };
  return { app, ctx, dataDir, db, close, json, upload, settle };
}
