// SPDX-License-Identifier: MIT
// The server's application — the family wiring, in the family's order (app-structure §Q.3, §8,
// §11, §14; docgen's app.js is the donor, JustWrite's the shutdown route and the database layer):
//
//   1. the log ring and the day file, before anything logs (Settings → Logs reads both);
//   2. the kit's server: request ids, problem+json errors, the family 500 (createServer);
//   3. the guards, outermost first and before every route — CSRF, CORS, bearer auth (Hono runs
//      middleware in the order added, for the routes added after it: a CSRF 403 carries no CORS
//      headers; CORS answers a preflight before auth sees it and stamps auth's 401/403);
//   4. the database (migrated) and the app state;
//   5. the family routers — health, shutdown, access tokens, prefs, logs, disk, backups;
//   6. the AI stack — the runner's router, then installLlm (seeding is serve.js's, not here: a
//      test's createApp(tmp) starts from an empty database);
//   7. the app's own routes;
//   8. the built UI for the headless path (GET only; anything else on an unrouted path is 405).

import { statSync } from "node:fs";
import path from "node:path";
import { installLlm, runnerRouter } from "@delebash/core/llm";
import { registerVisionAdapter } from "@delebash/core/llm/image_dispatch";
import {
  bearerAuth,
  CAPACITOR_ORIGINS,
  ChangeCounter,
  createServer,
  csrfOrigin,
  installFileLog,
  installLogRing,
  makeDiskRouter,
  MaintenanceGate,
  makeLogsRouter,
  makeShutdownRouter,
  makeSyncRevRouter,
  resourceIsolation,
  SHUTDOWN_PATH,
  serveUi,
  starletteCors,
} from "@delebash/core/platform";
import { purePath } from "@delebash/core/platform/data_paths";
import { getLogger } from "@delebash/core/platform/log";
import { router as designsRouter } from "./api/designs_api.js";
import { router as enginesRouter } from "./api/engines_api.js";
import { router as healthRouter } from "./api/health_api.js";
import { router as housesRouter } from "./api/houses_api.js";
import { router as jobsRouter } from "./api/jobs_api.js";
import { router as paintsRouter } from "./api/paints_api.js";
import { router as partsRouter } from "./api/parts_api.js";
import { router as prefsRouter } from "./api/prefs_api.js";
import { router as schemesAiRouter } from "./api/schemes_ai_api.js";
import { router as serverAuthRouter } from "./api/server_auth_api.js";
import { router as settingsRouter } from "./api/settings_api.js";
import { AppState, getState, setState } from "./app_state.js";
import { readAuth } from "./auth.js";
import { router as dataRouter } from "./data_admin.js";
import { openAppDatabase } from "./database/index.js";
import { getSetting, setSetting } from "./database/settings.js";
import { FEATURE_CATALOG } from "./feature_catalog.js";
import { defaultDataDir, SOURCE_ROOT } from "./paths.js";
import { DEFAULT_FEATURE_PROMPTS } from "./seed_feature_prompts.js";
import {
  CLASS_TUNE_IDENTITY,
  CLASS_TUNES,
  DEFAULT_ENGINE_PRESETS,
  DEFAULT_FEATURE_PRESETS,
  DEFAULT_PRESET_ID,
  FLUX2_KLEIN,
  MODEL_CATALOG,
  SAM3,
} from "./seed_presets.js";
import { ortBinDir, sam3Adapter } from "./finder.js";
import { housesRoot } from "./files.js";
import { createServices } from "./services.js";
import { PRODUCT } from "./version.js";

const log = getLogger("just_house_paint.app");

// the writes that change what another window shows: the houses, their parts, designs, paints now and AI photos; the
// brands and their colors; the app's settings; the engines (the house page offers or uses them — the kit's runtimes':
// the AI photo's engine and model, the part finder's model). Not one: a window's own prefs, a scheme worked out, a log
// line, a cancel (the job's end is counted), an AI run, the tokens.
export const DATA_WRITES = /^\/v1\/(houses|designs|renders|brands|paints|settings|ai\/runtimes)(\/|$)/;

/** The problem-type prefix of every error answer (`type`: `<base><slug>`, app-structure §15). */
export const TYPE_BASE = "https://just-house-paint.local/errors/";

/** The desktop window's origin — the kit's shell loads the UI from app://<id>. */
export const DESKTOP_ORIGIN = "app://justhousepaint";
/** The renderer's own origins: the desktop window and Quasar's dev server (its registered port,
 * app-structure §1 — the same number as quasar.config.js `devServer` and installLlmUi's
 * `devPorts`). The phone's webview origins are the kit's own (csrf.js CAPACITOR_ORIGINS). */
export const APP_ORIGINS = [DESKTOP_ORIGIN, "http://localhost:1460", "http://127.0.0.1:1460"];

/**
 * Where the built UI is, for the headless server (null when there is none): JUST_HOUSE_PAINT_UI_DIR;
 * a checkout's browser build, dist/spa/; or, packaged, the app folder — this package is installed
 * at <app>/node_modules/just-house-paint-server, so SOURCE_ROOT is <app>/node_modules, and Quasar
 * puts the built UI at <app> itself (resources/app.asar); then the working folder's dist/spa.
 */
export function locateUiDir() {
  const candidates = [];
  if (process.env.JUST_HOUSE_PAINT_UI_DIR) candidates.push(process.env.JUST_HOUSE_PAINT_UI_DIR);
  candidates.push(path.join(SOURCE_ROOT, "dist", "spa"));
  if (path.basename(SOURCE_ROOT) === "node_modules") candidates.push(path.dirname(SOURCE_ROOT));
  candidates.push(path.join(process.cwd(), "dist", "spa"));
  return candidates.find((c) => isFile(path.join(c, "index.html"))) ?? null;
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** installLlm's arguments: this app's AI data (app-structure §8). */
const llmArgs = (db, dataDir) => ({
  db,
  // Always: without it the engine and the models land outside the data folder.
  dataDir,
  // Names this app in the family's cache registry, so the next app installed can offer to share
  // the engine and models already on this machine instead of downloading them again.
  product: PRODUCT,
  featureCatalog: FEATURE_CATALOG,
  featurePrompts: DEFAULT_FEATURE_PROMPTS,
  enginePresets: DEFAULT_ENGINE_PRESETS,
  featurePresets: DEFAULT_FEATURE_PRESETS,
  defaultPresetId: DEFAULT_PRESET_ID,
  modelCatalogExtra: MODEL_CATALOG,
  classTunesSeed: CLASS_TUNES,
  classTuneIdentity: CLASS_TUNE_IDENTITY,
  // The AI photo's engine is the kit's stable-diffusion.cpp runtime, its model FLUX.2 [klein] 4B (seed_presets.js):
  // the kit installs, downloads, rates and runs them (the engines plan, H1); the AI page shows them on its Images tab.
  // The part finder's is the kit's in-process ONNX runtime, its model SAM 3 (round C, H2): ONNX Runtime is this app's
  // onnxruntime-node package, handed to the kit (D2) with where its native files are (the kit's runtime check); the
  // AI page shows it on its Vision tab.
  runtimes: ["sdcpp", "onnx"],
  runtimeModels: [FLUX2_KLEIN, SAM3],
  onnx: { load: () => import("onnxruntime-node"), binDir: ortBinDir() },
});

/**
 * The Hono app, not yet listening. `dataDir` defaults to the family data-folder ladder; `services`
 * replaces some of services.js's (a test's fake part finder, AI photo, fetch or AI run).
 */
export async function createApp(dataDir = null, { services = {} } = {}) {
  dataDir = dataDir ? purePath(String(dataDir)) : defaultDataDir();

  // 1. Server logs → the in-memory ring (Settings → Logs) and a day file that survives a crash.
  installLogRing();
  installFileLog(path.join(dataDir, "logs", "just-house-paint.log"));

  // 2. The kit's server — no onUnhandled of our own: the kit's answer is the family's.
  const app = createServer({ typeBase: TYPE_BASE });

  // 3. The guards. CSRF refuses a cross-site browser write to /v1 (no token, so it can never
  // lock anyone out). CORS answers the app's own origins only — the desktop window (app://), the
  // dev server, the phone — which call this port directly (server/tests/real_server.test.js proves
  // it through a real socket); the UI this server hosts is its own origin and needs none. Never
  // every origin: any web page the user opened could then read this computer's server, backups
  // and keys included (the security review, 2026-10-19). Bearer auth is off until Settings →
  // Server adds a token, and refuses a page that renamed itself to reach this computer (DNS
  // rebinding; JUST_HOUSE_PAINT_ALLOWED_HOSTS names a reverse proxy's public name); the desktop shell's
  // POST /v1/shutdown carries no token and stays open from this machine (the route refuses
  // anyone else itself).
  const allowedHosts = (process.env.JUST_HOUSE_PAINT_ALLOWED_HOSTS || "").split(",").map((h) => h.trim()).filter(Boolean);
  // a reverse proxy's public names: the browser's Origin there (https://paint.example.com) is the server's own,
  // though the server sees another scheme and host behind the proxy
  const proxyOrigins = allowedHosts.flatMap((h) => [`https://${h}`, `http://${h}`]);
  app.use("*", csrfOrigin({ appOrigins: APP_ORIGINS, extraOrigins: proxyOrigins, typeBase: TYPE_BASE }));
  // and a read the browser marks cross-site (Fetch Metadata — a cross-site <img> of /v1/data/backup made backups),
  // but the app's own windows by their Origin and a navigation to the UI's pages (the nineteenth review)
  app.use("*", resourceIsolation({ appOrigins: APP_ORIGINS, extraOrigins: proxyOrigins, typeBase: TYPE_BASE }));
  app.use("*", starletteCors({ allowOrigins: [...APP_ORIGINS, ...CAPACITOR_ORIGINS], allowMethods: ["*"], allowHeaders: ["*"] }));
  app.use("*", bearerAuth({ readAuth, typeBase: TYPE_BASE, loopbackOpenPaths: [SHUTDOWN_PATH], allowedHosts }));
  // While a restore or a reset replaces the data, every other window's write is refused (503, Retry-After) and the
  // ones already running finish first — never a save that lands half-way or answers 200 and is lost (the kit's
  // MaintenanceGate; the data router closes it). The shell's shutdown always passes.
  // only the app's data writes: a slow AI run or a brand's download never holds a restore up
  const gate = new MaintenanceGate({ exempt: [SHUTDOWN_PATH], isDataWrite: (c) => DATA_WRITES.test(c.req.path) });
  app.use("*", gate.middleware());
  // Each window's writes that succeed are counted apart (the kit's ChangeCounter — its X-Client-Id), so the other windows'
  // pages read again (GET /v1/sync/rev); a restore and a reset are everyone's change (data_admin.js).
  const changes = new ChangeCounter({ writes: DATA_WRITES, getSetting, setSetting });
  app.use("*", changes.middleware());

  // 4. The database and the app state the routes read: the house-paint services ride on it.
  const db = openAppDatabase(dataDir);
  // the data's epoch is kept in the database (a restore or a reset renews it)
  changes.useDatabase(db);
  setState(new AppState(dataDir, db, createServices({ db, dataDir }, { changes, ...services })));

  // 5. The family routers.
  app.route("/", healthRouter());
  // POST /v1/shutdown — the desktop shell's clean stop of this app's server it finds on its port
  // (src-electron/electron-main.js `shutdownPath`). The AI engine runs in this process's
  // kill-on-close job and ends with it.
  app.route("/", makeShutdownRouter());
  app.route("/", serverAuthRouter());
  app.route("/", prefsRouter());
  app.route("/", makeSyncRevRouter(changes, { pollSeconds: () => getState().checkSeconds() }));
  app.route("/", makeLogsRouter(PRODUCT));
  // Settings → Storage's sizes: the kit's buckets (the AI photo's and the part finder's engines and models are the
  // kit's — its engine builds and models cache) plus this app's own store, the houses' photos
  app.route("/", makeDiskRouter(dataDir, { houses: housesRoot(dataDir) }));
  app.route("/", dataRouter(dataDir, { gate }));

  // 6. The AI stack: the host mounts the runner's process API, installLlm mounts the rest.
  app.route("/", runnerRouter());
  await installLlm(app, llmArgs(db, dataDir));
  // SAM 3's own code (the samexporter port — the app's), built and held in memory by the kit's ONNX runtime
  registerVisionAdapter(SAM3.id, sam3Adapter());

  // 7. The app's own routes.
  app.route("/", settingsRouter());
  app.route("/", housesRouter());
  app.route("/", partsRouter());
  app.route("/", designsRouter());
  app.route("/", jobsRouter());
  app.route("/", paintsRouter());
  app.route("/", schemesAiRouter());
  app.route("/", enginesRouter());

  // 8. The built UI, served for the headless path — a browser at this address is the whole app
  // (the kit's serveUi: a write there 405, hashed files kept, the rest revalidated). Every /v1 route
  // above wins first (Hono runs routes in the order added).
  const uiDir = locateUiDir();
  if (uiDir !== null) {
    serveUi(app, uiDir);
    log.info(`UI served from ${uiDir}`);
  } else {
    log.warning("no built UI found — the headless UI is off. `npm run build:spa` makes dist/spa/, or set JUST_HOUSE_PAINT_UI_DIR.");
  }

  return app;
}
