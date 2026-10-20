// SPDX-License-Identifier: MIT
// The two local engines: the part finder (SAM 3) and the AI photo (stable-diffusion.cpp) — whether
// each is installed, installing it (a job: ~3.4 GB / ~9 GB of downloads), the AI photo of a house
// (a job), and the AI photos kept.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { statfs } from "node:fs/promises";
import path from "node:path";
import { assertGpuFree } from "../jobs.js";
import { Hono, input } from "@delebash/core/platform";
import { ApiError, notFound } from "@delebash/core/platform/errors";
import { designNotFound, houseNotFound } from "./refusals.js";
import { addRender, deleteRender, getDesign, getHouse, getRender, listParts, listRenders } from "../database/houses.js";
import { paintsById } from "../database/paints.js";
import { removeHouseFile, renderPath } from "../files.js";
import { AiPhotoIn, IdParams } from "../schemas/houses.js";
import { getState } from "../app_state.js";
import { aiphotoEngineDir, aiphotoModelDir, finderModelDir } from "../services.js";

/** Room a drive keeps beyond what an install puts on it (the database, the logs) — as the kit's restore keeps. */
const ROOM_MARGIN = 256 * 1024 * 1024;

/** Free bytes for this user on the drive holding `dir` — fs.statfs's bavail × bsize
 *  (nodejs.org/api/fs.html#fspromisesstatfspath-options), asking the nearest folder that exists (an
 *  engine's own isn't made yet); Infinity when the drive doesn't answer (the install's own errors stand). */
export async function freeBytes(dir) {
  let d = path.resolve(dir);
  for (;;) {
    try {
      const s = await statfs(d);
      return s.bavail * s.bsize;
    } catch (e) {
      const up = path.dirname(d);
      if (e?.code !== "ENOENT" || up === d) return Number.POSITIVE_INFINITY;
      d = up;
    }
  }
}

const gb = (n) => `${(n / 1e9).toFixed(1)} GB`;

/** The bytes the unfinished downloads (`*.part`, the kit's streamDownload preallocates each at its full size and
 *  keeps it for resume) already hold under `dirs` — they need no more room (a resumed install was refused 507 —
 *  the fourteenth review). */
export function partBytes(dirs, depth = 3) {
  let n = 0;
  const walk = (d, left) => {
    let entries = [];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return; // not made yet
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && left > 0) walk(p, left - 1);
      else if (e.isFile() && e.name.endsWith(".part")) n += statSync(p, { throwIfNoEntry: false })?.size ?? 0;
    }
  };
  for (const d of dirs) walk(d, depth);
  return n;
}

/** `ctx`: { db, dataDir, jobs, finder, aiphoto, download, sharedGpu?, freeBytes? } — `download` is the
 * kit's streamDownload; `sharedGpu()` what else holds the graphics card (services.js); `freeBytes(dir)`
 * a test's drive. */
export function router(ctx = getState()) {
  const app = new Hono();
  // the engines being removed (Settings → Storage): nothing installs into, or runs from, a folder going away
  const removing = (ctx.enginesRemoving ??= new Set());
  const notWhileRemoved = (engine, name) => {
    if (removing.has(engine)) throw new ApiError(409, "engine-busy", `${name} is being removed`, "try again when it's done");
  };
  /** An install that wouldn't fit the drive of the data folder is refused before anything downloads (a full
   *  disk mid-download left a cut-off file and a raw ENOSPC — 3.3 GB / 9.6 GB, the thirteenth review). */
  const mustFit = async (name, bytes, dirs = []) => {
    // what an unfinished download already holds on the drive needs no more room
    bytes = Math.max(0, bytes - partBytes(dirs));
    if (!bytes) return;
    const free = await (ctx.freeBytes || freeBytes)(ctx.dataDir);
    if (bytes + ROOM_MARGIN > free) {
      throw new ApiError(507, "disk-full", "Not enough room on the drive", `${name} needs ${gb(bytes + ROOM_MARGIN)} on the drive of the app's data folder; it has ${gb(free)} free — make room, or move the data folder to a bigger drive`, {
        needBytes: bytes + ROOM_MARGIN,
        freeBytes: free,
      });
    }
  };

  // not installed yet: whether its runtime loads here, so the install card can say so before the download
  app.get("/v1/segment/status", async (c) => {
    const installed = ctx.finder.installed();
    return c.json({ installed, downloadBytes: ctx.finder.downloadBytes(), ...(installed ? {} : { runtime: await ctx.finder.runtime() }) });
  });

  // The finder's runtime loads on this computer (the release's start check asks it on every runner).
  app.get("/v1/segment/runtime", async (c) => {
    const r = await ctx.finder.runtime();
    if (!r.ok) throw new ApiError(503, "runtime-missing", "The part finder can't run on this computer", r.error);
    return c.json(r);
  });

  app.post("/v1/segment/install", async (c) => {
    notWhileRemoved("finder", "The part finder");
    // nothing downloads that couldn't run here, or wouldn't fit
    const runtime = await ctx.finder.runtime();
    if (!runtime.ok) throw new ApiError(409, "runtime-missing", "The part finder can't run on this computer", runtime.error, runtime.reason ? { reason: runtime.reason } : null);
    await mustFit("The part finder", ctx.finder.downloadBytes(), [finderModelDir(ctx.dataDir)]);
    const job = ctx.jobs.start({ kind: "install-finder", key: "", failTitle: "The part finder didn't install" }, ({ signal, progress }) =>
      ctx.finder.install({
        download: ctx.download,
        signal,
        onProgress: (e) => progress(e.overallTotal ? e.overallDone / e.overallTotal : 0, e.name),
      }),
    );
    return c.json(job, 202);
  });

  // Remove the part finder's model (Settings → Storage) — not while it finds parts or installs.
  app.delete("/v1/segment/install", async (c) => {
    if (ctx.jobs.busy(["find-parts", "install-finder"])) {
      throw new ApiError(409, "engine-busy", "The part finder is busy", "wait until it has finished finding the parts or installing");
    }
    removing.add("finder");
    try {
      await ctx.finder.uninstall();
    } finally {
      removing.delete("finder");
    }
    return c.body(null, 204);
  });

  app.get("/v1/aiphoto/status", async (c) => c.json(await ctx.aiphoto.status()));

  // Remove the AI photo's engine and models (Settings → Storage) — not while it draws or installs.
  app.delete("/v1/aiphoto/install", async (c) => {
    if (ctx.jobs.busy(["aiphoto", "install-aiphoto"])) {
      throw new ApiError(409, "engine-busy", "The AI photo is busy", "wait until it has finished drawing or installing");
    }
    removing.add("aiphoto");
    try {
      await ctx.aiphoto.uninstall();
    } finally {
      removing.delete("aiphoto");
    }
    return c.body(null, 204);
  });

  app.post("/v1/aiphoto/install", async (c) => {
    notWhileRemoved("aiphoto", "The AI photo");
    // nothing downloads that couldn't run here (the system it needs), or wouldn't fit
    const st = await ctx.aiphoto.status();
    if (st.available === false) {
      throw new ApiError(409, "cant-run-here", "The AI photo can't run on this computer", st.need?.detail || "this computer can't run its engine", { reason: st.need?.reason ?? null });
    }
    await mustFit("The AI photo", st.diskBytes ?? st.downloadBytes, [aiphotoModelDir(ctx.dataDir), aiphotoEngineDir(ctx.dataDir)]);
    const job = ctx.jobs.start({ kind: "install-aiphoto", key: "", failTitle: "The AI photo didn't install" }, ({ signal, progress }) => ctx.aiphoto.install({ download: ctx.download, signal, progress }));
    return c.json(job, 202);
  });

  app.post("/v1/houses/:id/aiphoto", input({ params: IdParams, body: AiPhotoIn }), (c) => {
    const house = getHouse(ctx.db, c.req.valid("param").id);
    if (!house) throw houseNotFound(c.req.valid("param").id);
    notWhileRemoved("aiphoto", "The AI photo");
    const { designId, colors } = c.req.valid("json");
    let chosen = colors || {};
    if (designId) {
      const d = getDesign(ctx.db, designId);
      if (!d || d.houseId !== house.id) throw designNotFound(designId);
      chosen = d.colors;
    }
    const paintable = new Set(listParts(ctx.db, house.id).filter((p) => p.paintable && p.area > 0).map((p) => p.key));
    // each part's paint now, where its owner said: the lock paints in the light it gives
    const now = house.currentPaints || {};
    const paints = paintsById(ctx.db, [...Object.values(chosen), ...Object.values(now)].filter(Boolean));
    // a paint no longer loaded (its brand removed, or loaded again without it — in another window, maybe) is named,
    // never left out of the picture unsaid
    const gone = Object.entries(chosen).filter(([key, id]) => id && paintable.has(key) && !paints[id]);
    if (gone.length) {
      const parts = gone.map(([key]) => ctx.partLabel?.(key) ?? key);
      throw new ApiError(422, "paints-gone", "Some colors aren't loaded any more", `the paint of the ${parts.join(", ")} — load its brand again, or pick another color`, {
        parts: gone.map(([key]) => key),
      });
    }
    const surfaces = Object.entries(chosen)
      .filter(([key, id]) => id && paintable.has(key) && paints[id])
      .map(([key, id]) => ({ key, hex: paints[id].hex, name: paints[id].name, currentHex: paints[now[key]]?.hex ?? null }));
    assertGpuFree(ctx.jobs, "aiphoto", house.id);
    const job = ctx.jobs.start({ kind: "aiphoto", key: house.id, label: house.name, failTitle: "The AI photo didn't finish", clientId: c.req.header("x-client-id") || null }, async ({ signal, progress }) => {
      const renderId = crypto.randomUUID();
      // what else holds the graphics card, measured beside the render (about a second on Windows)
      const shared = (ctx.sharedGpu?.() ?? Promise.resolve(null)).catch(() => null);
      const r = await ctx.aiphoto.render(house, surfaces, { renderId, signal, progress });
      // the design deleted while it rendered: the AI photo stays, without the link
      const keepDesign = designId && getDesign(ctx.db, designId) ? designId : null;
      try {
        const render = addRender(ctx.db, { houseId: house.id, designId: keepDesign, file: r.file, engine: r.engine, deltaE: r.deltaE, seconds: r.seconds });
        return { ...render, sharedGpu: await shared };
      } catch (e) {
        // the picture whose row didn't save goes (retried; a held one is left) — the row's own error stands
        await removeHouseFile(renderPath(ctx.dataDir, house.id, r.file.replace(/\.png$/, "")));
        throw e;
      }
    });
    return c.json(job, 202);
  });

  app.get("/v1/houses/:id/renders", input({ params: IdParams }), (c) => {
    if (!getHouse(ctx.db, c.req.valid("param").id)) throw houseNotFound(c.req.valid("param").id);
    return c.json(listRenders(ctx.db, c.req.valid("param").id));
  });

  app.get("/v1/renders/:id/image", input({ params: IdParams }), (c) => {
    const r = getRender(ctx.db, c.req.valid("param").id);
    if (!r) throw notFound(`no AI photo ${c.req.valid("param").id}`);
    const file = renderPath(ctx.dataDir, r.houseId, r.file.replace(/\.png$/, ""));
    if (!existsSync(file)) throw notFound("the AI photo's file is missing");
    return c.body(readFileSync(file), 200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
  });

  app.delete("/v1/renders/:id", input({ params: IdParams }), async (c) => {
    const r = getRender(ctx.db, c.req.valid("param").id);
    if (!r) throw notFound(`no AI photo ${c.req.valid("param").id}`);
    deleteRender(ctx.db, r.id);
    // the AI photo is gone; a file Windows still holds is left, never a row without its picture
    await removeHouseFile(renderPath(ctx.dataDir, r.houseId, r.file.replace(/\.png$/, "")));
    return c.body(null, 204);
  });

  return app;
}
