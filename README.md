<!-- SPDX-License-Identifier: MIT -->
# Just House Paint

See your own house in real paint colors before you buy paint. Add a photo of your house; the app finds its parts —
the body, the trim, the doors, the shutters — on your own computer, paints them with real brand paints in the
photo's own light and shadow, tells you how close each painted wall comes to the paint chip, suggests whole color
schemes, keeps your designs, and can draw an AI photo of the house in the new colors. Nothing is uploaded: your
photos stay on your computer, and the AI runs there too unless you choose an online provider.

A desktop app for Windows, macOS (Apple silicon) and Linux, built with **Electron + Quasar (Vue 3) + Pinia** and a
local **Node (Hono) server** that holds all the data in SQLite — plain JavaScript end to end. **Download** the
installer from the [releases](https://github.com/delebash/just-house-paint/releases) (Help → Getting started says
how to open an installer that isn't signed yet). User docs live in `docs/`; the website at
<https://delebash.github.io/just-house-paint-website/> mirrors them for each release.

---

## Features

### ✶ Your houses — a photo is all it takes

- **Add a photo** of the house (JPEG, PNG or WebP); the app keeps the original and makes a screen copy and a
  card for the list. Rename and delete; each house keeps its parts, designs and AI photos.
- **Everything is the house's own folder** in the app's data folder — backed up with the rest, moved with it.

### ✶ Finding the parts — on your computer

- **One click finds the parts**: Meta's **SAM 3** vision model, running on your computer (ONNX Runtime; on
  Windows the graphics card helps), finds the body, trim, front door, garage door, shutters, columns, railings,
  gutters, soffits and fascia, window trim, the chimney and wall decorations — and what isn't painted: the roof,
  windows, stone, brick and lamps.
- **Your house only**: a neighbor's house, a car parked in front and a garden statue are left alone.
- **Every pixel belongs to one part** — where two parts overlap, the more specific one keeps it (the garage door
  before the door, the gutters before the trim).
- **Fix what it missed**: a **Brush** and an **Eraser** for any part, a **Box** around something the finder then
  outlines, **Add the part** for one it didn't find; **Undo** and **Redo**.
- **Find the parts again** keeps the parts you changed by hand, if you like.

### ✶ Painting — real paint in the photo's own light

- **Real brand paints**: pick a color for each part; it paints at once, keeping the photo's shadows, texture and lap
  lines — a wall in shade is the same paint, darker.
- **How close it is**: each part shows its **ΔE** to the paint chip (under 1, a difference most people can't see).
- **On it now**: tell the app the paint a part has today, and new colors show in the light that paint reveals.
- **Light** and **Texture** sliders; **Outlines** of one part, all, or none.
- **Compare** with the photo as taken, or with another design — a line across the photo, or side by side.
- **Save image** at full size, **Copy the color list** to take to the store, **Save a color card** of the photo and
  its paints.
- **Designs**: save the colors as a design, keep several, open one to put its colors back.

### ✶ Paint colors — seven brands, kept on your computer

- **Sherwin-Williams, Behr, Benjamin Moore, Valspar, PPG / Glidden, HGTV Home by Sherwin-Williams and Dutch Boy**:
  each brand's colors fetched from the brand and kept, loading by themselves the first time the app opens.
- **Import a palette file** a brand publishes: Adobe swatches (.ase, .aco), Excel and CSV.
- **Find a color** by name or number, by color family, sorted by color or by name; exterior colors only, or all;
  discontinued colors hidden unless asked for.

### ✶ Color schemes — whole schemes, always real paints

- **From a paint you chose**: harmony schemes built around the body's color.
- **The brand's own pairings**: the colors a brand coordinates with your paint.
- **Ask the AI**: schemes that suit what stays — the roof, the stone, the windows — and the words you add, every color
  snapped to the brand's nearest real paint.
- **Apply** puts a scheme on the house: the body color, the trim color, the accent on the front door and shutters.

### ✶ The AI photo — the whole house, newly painted

- **FLUX.2 [klein] 4B** on your computer (stable-diffusion.cpp) repaints only inside the parts' outlines; the app
  puts your photo back everywhere else and locks what the model repainted to the paint colors. Its colors are
  approximate — the model decides the light — and the picture says how far the part furthest off is from its chip.
- About **20 seconds** a picture on Windows with an 8 GB NVIDIA graphics card. Every AI photo is kept with the house.
- **Installed when you want it**: the engine and the model download from the house page or the AI page, with their
  progress and **Cancel**; the app checks the drive has room first.

### ✶ AI — on your terms

- **Local and free**: the built-in engine (llama.cpp) runs a chat model on your computer for the color schemes;
  **Quick Setup** picks one that fits the computer.
- **Or online**: OpenAI, Anthropic (Claude), Gemini, OpenRouter, DeepSeek, xAI, Mistral, or any OpenAI-compatible
  service.
- **Routing by feature**: each AI feature — the schemes, the AI photo, the part finder — on its own model and
  settings; the graphics card shared between them by themselves.
- **Usage** counts the calls and their cost; the **AI tasks** panel shows what runs, with **Cancel**.

### ✶ Everywhere the family's apps are

- **Backups**: export everything as one file, restore it; **Reset** to start over.
- **Storage**: see what takes the space, move the data folder to another drive.
- **On another computer**: run the server on its own and use the app from a browser on your network, with access
  tokens.
- **Several windows at once** stay in step; **Appearance** sets light or dark and the accent color; **Updates** come
  by themselves (Windows and Linux; on a Mac from the release page); **Logs** for when something goes wrong.

---

## Quick start

```bash
npm install            # the renderer and the server/ workspace (the kit ../just-core sits beside this repo)
cd src-electron && npm install && cd ..       # once: the desktop app's own packages
cd e2e && npm install && cd ..                # once: the e2e harness
cd ../just-core/packages/ui && npm install    # once: the fonts the kit bundles
npm run dev            # the desktop app, live (quasar dev -m electron); its server on the dev data folder data/
npm run build          # the installer for this computer → dist/electron/Packaged
```

A fresh data folder opens on **Your houses**: add a photo, and the house page offers the part finder's model the
first time. The family's standard this app follows is `../just-core/docs/app-structure.md` (§Q wins); what it is
for is `docs/dev/PRD.md`, why it is built the way it is `docs/dev/ARCHITECTURE.md`, and the instructions for an AI
are `AGENTS.md`.

---
## Developing

### The shape

| Folder | What | How it runs |
|---|---|---|
| `src/` | the renderer: Vue 3, Quasar's components under the kit's (`@delebash/ui`), Pinia, the hash router, vue-i18n | Quasar's CLI builds it for every mode |
| `server/` | the app's Node server, its own package (`just-house-paint-server`): Hono from the kit, the family guards, the family routers, the AI stack (`installLlm`), the database (`database/`), the houses, parts, designs, paints and schemes routes, the part finder (`segment/`, `finder.js`), the paint lists (`paints/`), the AI photo (`aiphoto/`, `aiphoto_service.js`) | the desktop app runs it in a utilityProcess; `npm run server` headless |
| `src-electron/` | the desktop app: `electron-main.js` is the kit's `runDesktopApp` with this app's names; the preload is the kit's | `quasar dev -m electron` · `quasar build -m electron` (electron-builder, NSIS) |
| `src-capacitor/` | the phone app (Android), as Quasar generates it — not working yet: a phone build has no server (the PRD puts the phone after v1) | `quasar build -m capacitor -T android` |
| `build/launcher/` | the headless launcher `just-house-paint-server.cmd`: the installed exe (`justhousepaint.exe`) run as Node on its server package — never the exe's name (§Q.3) | copied beside the exe by the installer |
| `e2e/` | the smoke suite and the screenshot capture over the real desktop app (Playwright's `_electron`), hermetic | `npm test` · `npm run screenshots` |
| `docs/` | the Help pages (`toc.json`, the five the family requires + your houses, finding the parts, painting, paint colors, color schemes, the AI photo) and `docs/dev/` (README, PRD, TASKS, IDEAS, RESEARCH) | the kit's Help drawer; `whats-new.md` feeds Settings → Updates |

### What every family app carries — where it is here

| Part | Files |
|---|---|
| Server wiring (§Q.3, §8, §11, §14) | `server/src/app.js` (the order), `serve.js`, `version.js`, `paths.js`, `app_state.js` (with `services.js` — the jobs, the engines, the settings readers), `auth.js`, `data_admin.js` (the backup takes `houses/`), `api/{health,server_auth,prefs,settings}_api.js` |
| Data (§16) | `server/src/database/` — `schema.js` (migrations; v1 settings, v2 houses · parts · designs · paints · renders, v3 the paint on each part now), `index.js` (open + migrate), `seed.js`, the stores `houses.js`, `paints.js` and `settings.js`; each house's files under `data/houses/<id>/` (`files.js`) |
| Validation and errors (§15) | `server/src/schemas/` (shared with the forms), the kit's `input()`, `notFound`, problem+json with request ids |
| The AI half (§8) | `server/src/feature_catalog.js` (`schemes.suggest`, `aiphoto.render` — kind image, `parts.find` — kind vision), `seed_feature_prompts.js` (the schemes' prompt row, from `schemes_ai.js`), `seed_presets.js` (the presets, JustWrite's three general Gemma rows and their class tunes, the AI photo's FLUX.2 [klein] and the part finder's SAM 3 as the kit's runtime models) |
| The chrome (§11) | `src/layouts/MainLayout.vue`, `src/components/TitleBar.vue`, `src/pages/{AiPage,SettingsPage,ConnectionErrorPage}.vue`, `src/components/settings/` (General and Advanced are this app's), `index.html`'s `#app-boot` plate |
| The screens | `src/pages/{HomePage,HousePage,ColorsPage}.vue` (Your houses, the house, Paint colors); the house's tabs `src/components/{PartsTab,ColorsTab,SchemesTab,DesignsTab}.vue`; the canvas `HouseCanvas.vue` (Konva); `NameDialog`, `AiPhotoDialog` (the engines' banners are the kit's `LuEngineNeeded`) |
| Start-up (§Q.4) | `src/boot/i18n.js`, `src/boot/justhousepaint.js` |
| Services and stores | `src/services/{native,helpDocs,appearance,settingsSections}.js`; the painter `src/services/{tint,painter,maskImage,partNames,houseHistory,colorCard}.js` (a long job runs through the kit's `runServerJob`); `src/stores/{ui,settings,houses,house,paints,engines}.js` |
| Tests (§18) | `server/tests/`, `src/**/*.test.js`, `src/boot.smoke.test.js`, `e2e/` |

### Commands

```bash
npm run dev            # the desktop app, live (quasar dev -m electron)
npm run dev:spa        # the renderer alone in a browser tab on :1460 (start the server yourself)
npm run server         # the server alone on :17499 (scripts/node24.js — Electron's Node); the UI at /
npm run build          # the installer → dist/electron/Packaged
npm run build:spa      # the browser build → dist/spa
npm run build:unpacked # the desktop app unpackaged → dist/electron/UnPackaged (what e2e drives)
npm run build:android  # the Android app
npm run lint           # Biome
npm run i18n:lint      # the i18n lint (zero)
npm run i18n:report    # keys missing from the English catalog (none)
npm run test:server    # the server's tests (Vitest on Electron's Node)
npm run test:unit      # the renderer's tests (Vitest, jsdom, Vue Test Utils + Quasar)
npm test               # the e2e smoke on the unpacked desktop build
npm run screenshots    # every surface as a PNG
npm run test:coverage  # coverage (v8), no gate
npm run bump 0.2.0     # the version (package.json and server/package.json)
npm run release        # the release: installers + the update feed built on GitHub (manual only)
```

### What differs from Quasar's default, and why

- **`src-electron/electron-main.js` is the kit's shell**, not Quasar's window code: one shared
  implementation of the data folder, the server process, the tray and the window on `app://<id>`
  (Quasar's template loads `file://`).
- **The main process's dependencies are local packages** (`file:` the app's `server/` and the
  kit): `quasar.config.js` makes their paths absolute for `dist/electron/UnPackaged` and installs
  them with `npm install --install-links` (real copies, production dependencies only).
- **`server/` is an npm workspace** of the root: one `npm install`, one copy of what the renderer
  and the server share — and the renderer imports the server's request schemas by name
  (`just-house-paint-server/schemas/houses.js`) for its forms, and the brush's mask code
  (`just-house-paint-server/shared/masks.js`).
- **The server runs on Electron's own Node** (`scripts/node24.js`) — the runtime it ships on, the one
  its native modules (better-sqlite3) are built for. Its tests too.
- **electron-builder**, not @electron/packager: NSIS installers (per user, the kit's
  `installer.nsh`), Electron's fuses, better-sqlite3's build leftovers excluded.
- **The CSP `<meta>`** in `index.html` lets the page reach its server (`connect-src http: https:`).
- **The boot plate** (`#app-boot` in `index.html`) shows the same picture as the warm-start splash —
  start-up is one continuous image, never a spinner.
- **Boot files**, not `main.js`: `src/boot/i18n.js` (vue-i18n, as Quasar's i18n preset installs
  it) and `src/boot/justhousepaint.js` (the kit's UI, error reporting, Help, the server check, the
  preferences, the warm start).
- **The router is one exported instance** and the layout route is imported, not lazy (§Q.4).
- **No Roboto or Material Icons** (`extras: []`): the type is the tokens' `--font-ui` and Quasar
  draws the kit's line icons.
- **The theme**: `src/css/quasar.variables.scss` imports the kit's, `postcss.config.js` runs the
  kit's `dropQuasarDisabledRule()` and `quasarBaseLayer()`, `ripple: false`, the `Notify` plugin
  for the kit's toasts; `src/css/tokens.css` is hue-driven so Settings → Appearance retints it.
- **Biome**, not ESLint/oxlint (the family's one `biome.json`); ESLint runs one thing only, the i18n
  lint (`eslint.i18n.config.js`, the kit's file). Husky + lint-staged run Biome on staged files.
- **`resolve.dedupe`**: the aliased kit's peers come from this app's `node_modules`, one copy each.
- **`allowScripts`** in every `package.json` Quasar installs into (see "Traps").
- **Removed from the scaffold:** `EssentialLink.vue`, the example store, `IndexPage`/`SecondPage`/
  `ErrorNotFound` (a not-found page lives inside the chrome), the Quasar logo, the pnpm workspace
  files, the ssr/ssg/pwa/cordova/bex config blocks, `engines` and `keywords` in `package.json`.
- `src-capacitor/capacitor.config.js` stays CommonJS as Quasar generates it — the one non-ESM file.
- The icons (`public/icons`, `src-electron/electron-assets/icons`) are still Quasar's logo; an app
  brings its own (`tray.png` is the icon at 32 × 32).

### The engines and their files

The AI photo and the part finder run on the kit's engines, the way its llama.cpp does (the kit's
`docs/plans/2026-10-24-engines-the-llama-way.md`): the AI photo on its stable-diffusion.cpp runtime (a resident
`sd-server`, FLUX.2 [klein] 4B), the part finder on its in-process ONNX runtime (SAM 3; this app hands the kit its
own `onnxruntime-node`, and keeps SAM 3's pre- and post-processing as the kit's vision adapter — `finder.js`,
`segment/`). Their builds and models live in the kit's AI cache (`<data folder>/ai-cache`, or another family
app's when the cache is shared), are downloaded only when the user presses the button (each file checked against its
SHA-256, the drive's room checked first), are not in a backup, and share the graphics card through the kit's
arbiter. An older install's files move into the cache at start (`aiphoto/migrate.js`, `segment/migrate.js`).
`onnxruntime-node` loads on the first part search, never at start-up; its install script is off (`allowScripts`)
— the CPU and DirectML builds ship in the package.

The tests that run the real engines are off by default: `HP_REAL_SAM3=1` and `HP_REAL_SD=1` with
`HP_REAL_CACHE=<the kit's cache folder>` (the part finder and the AI photo on the probe's photo — `data/probe/`,
gitignored; their output under the system's temp folder or `HP_REAL_OUT`, never the data folder),
`HP_LIVE_FEEDS=1` / `HP_LIVE_FILES=1` (the brands' real lists and files).

### Releasing

`npm run bump <version>` sets the version (package.json and server/package.json); commit, tag `v<version>`, push;
`npm run release` dispatches `.github/workflows/release.yml`: the installers for Windows, macOS and Linux, each
started on its runner before anything is attached (`scripts/start-packaged.js` — the window, the server on its own,
the part finder's engine check), the update feed, and the user docs as `docs.tar.gz`; then the website
([just-house-paint-website](https://github.com/delebash/just-house-paint-website)) is asked to rebuild from them
(the secret `WEBSITE_DISPATCH_TOKEN`; without it, `gh workflow run deploy.yml -R delebash/just-house-paint-website` — the site never builds on its own). A dry run (`publish: false`;
a branch works as the tag) builds and checks everything and keeps the files on the run instead of a release.

### Traps

- **npm 11 refuses `allow-scripts` from `.npmrc` in a project install** unless the project's
  `package.json` declares `allowScripts`; `npm run` also hands the setting to every child as
  `npm_config_allow_scripts`, which made Quasar's own installs fail (`EALLOWSCRIPTS`), so
  `quasar.config.js` deletes that variable first thing (2026-10-08).
- **`build:unpacked` installs no `node_modules` into `dist/electron/UnPackaged`**: the unpacked app
  finds the kit's shell in the checkout's `node_modules`, and its own server can't start from there.
  The e2e harness runs the server itself; `npm run build` installs everything for the installer.
- **The agent's shell sets `NoDefaultCurrentDirectoryInExePath=1`**, so cmd won't run `gradlew.bat`
  from the current folder; build Android there with `env -u NoDefaultCurrentDirectoryInExePath …`.
- Quasar's dev watcher must not watch `data/` (Chromium keeps its files locked) — `extendViteConf`.
