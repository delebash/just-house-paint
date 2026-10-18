# Just House Paint — instructions for any AI working in this repo

See your house in real paint colors before you buy paint: a photo of the house, its parts found by
a vision model (SAM 3, on ONNX Runtime) on the user's computer, painted with real brand paints in
the photo's own light, color schemes (harmony, the brands' pairings, an AI model), designs, and an
AI photo (stable-diffusion.cpp + FLUX.2 [klein], on the user's computer). A family app: the desktop
app on the kit's shell, its own Node server (Hono) with a SQLite database, the AI stack, the
standard chrome. Plain JavaScript, `"type": "module"` everywhere; Vue SFCs; Quasar's components
under the kit's (`@delebash/ui`).

`README.md` lists the layout and every difference from Quasar's default; `docs/dev/PRD.md` is what
the app is for; `docs/plans/2026-10-18-v1.md` how v1 was planned.

## Commands

```bash
npm install            # the renderer and the server/ workspace; once each: (cd src-electron && npm install), (cd e2e && npm install), and the kit's fonts (cd ../just-core/packages/ui && npm install)
npm run dev            # the desktop app, live (the shell starts the server on <repo>/data)
npm run dev:spa        # the renderer alone in a browser tab on :1460 (run `npm run server` beside it)
npm run server         # the server alone (headless) on :17499, the built UI at /
npm run build          # the installer (dist/electron/Packaged)
npm run build:spa      # the browser build (dist/spa), what the headless server serves
npm run build:unpacked # the desktop app unpackaged — what the e2e smoke drives
npm run lint           # Biome
npm run i18n:lint      # no word written into a template or built in code (must be 0)
npm run i18n:report    # keys used but missing from the English catalog (must be none)
npm run test:server    # the server's tests, on Electron's Node
npm run test:unit      # the renderer's tests (the painter, the stores, the mounted pages, the boot smoke)
npm test               # the e2e smoke on the unpacked desktop build (build:unpacked first)
npm run screenshots    # every surface as a PNG in e2e/shots/
npm run test:coverage  # coverage (Vitest's v8), no gate
```

**Must pass before a commit:** `npm run lint && npm run test:server && npm run test:unit` and the
family guard, `node ../just-core/scripts/check-family.js`. The pre-commit hook (Husky + lint-staged) runs Biome
on the staged files. A change a user can see also passes `npm run i18n:lint`, updates `docs/*.md`,
and `npm run build:unpacked && npm test`.

## What bites

- **The server owns the data.** The renderer keeps nothing durable: it asks `/v1/*`. A value a user
  might change is a seeded row (`server/src/database/seed.js`) with a schema
  (`server/src/schemas/settings.js`), never a constant.
- **SQL lives only in the stores** (`server/src/database/houses.js`, `paints.js`, `settings.js`). A
  schema change is a new entry in `database/schema.js` `MIGRATIONS` — never an edit to an applied
  one. A house's files are `data/houses/<id>/` (`files.js`); the backup takes that folder.
- **A route's schema is its form's rules.** `server/src/schemas/<area>.js` imports only
  `@delebash/core/platform/schema`, because the renderer imports it too
  (`just-house-paint-server/schemas/<area>.js`, `schemaRules(...)`).
- **Errors:** a refusal is the kit's `notFound`/`ApiError`, never hand-built JSON; the renderer shows
  a failure through `reportError`, a 422 under its field through `fieldErrors`. Never log a secret or
  the user's content.
- **AI calls go through the kit's runners** (`runAiFeature`, `withAiTask`, the server's `runAction`)
  — never the task store directly. A new AI feature is a `feature_catalog.js` row + a prompt row +
  a preset, registered the day it calls the engine. Long server work (finding parts, downloads, the
  AI photo) is a job (`jobs.js`, `GET /v1/jobs/:id`), shown by the renderer's `services/jobs.js`
  inside `withAiTask`.
- **The engines are heavy and optional.** Nothing downloads until the user presses Install; the
  AI photo frees the GPU first (the finder's session, the local AI model). The routes take their
  engines from the app state (`services.js`), so a test passes fakes (`tests/domain_helpers.js`).
- **Seeding is serve.js's**, not `createApp`'s: a test's `createApp(tmp)` starts empty.
- **Server tests use `useHermeticKit()`** (`server/tests/helpers.js`): the kit's singletons, the fake
  hardware, `JUST_AI_HOME` in a temp folder.
- **`window.appShell` is read only by `src/services/native.js`.** Every word is a vue-i18n key.
- **The e2e smoke needs port 17499 free** — it runs its own server there and won't touch yours.

## Where to look

| For | Read |
|---|---|
| **THE family app structure — every app** | `../just-core/docs/app-structure.md` (§Q the layout, §11 the chrome, §15–§18 the contracts) |
| The shared stack (kit) | `../just-core/docs/dev/README.md` · `../just-core/packages/core/README.md` |
| What this app is for | `docs/dev/PRD.md` |
| Open work · ideas | `docs/dev/TASKS.md` · `docs/dev/IDEAS.md` |
| What is already known | `docs/dev/RESEARCH.md` (the kit's: `../just-core/docs/dev/RESEARCH.md`) |
| A route, its schema and its test | `server/src/{api,schemas}/houses*` · `server/tests/houses.test.js` |
| A screen and its mounted test | `src/pages/HomePage.vue` · `src/pages/HomePage.test.js` (the template's notes area is the family's reference) |

## The family rules

A copy of the kit's `docs/family-rules.md`, kept identical by a check — edit the kit's file, never
this copy.

<!-- family-rules:start -->
# Family rules

The rules every family repo follows: JustWrite, JustVoice, docgen and this kit. Each repo's
CLAUDE.md imports this file; a repo's own rules stay in its CLAUDE.md. How an app is laid out is
[`app-structure.md`](app-structure.md) §Q; the reference app is [`../template/`](../template/).

- **No hardcoded values a user might want to change.** Thresholds, limits, names and presets live
  in the database (seeded, editable in Settings), not in code, so changing one never needs a code
  change.
- **The server owns the data.** An app's data is one SQLite database that only its server reads
  and writes; the screen holds no durable data and asks the server. The desktop window, the
  browser tab of a headless server, the phone and other apps calling the API must all see the
  same data.
- **Nothing hand-rolled that Quasar or the kit ships.** The kit's `Ui*` controls sit on Quasar's
  components; apps use the `Ui*` API, and a shape the kit doesn't have uses Quasar's own component
  before anything hand-rolled. Before building a control, dialog, task or service, look in the kit
  (`packages/ui/src/index.js`, `packages/ui/src/common/index.js`, `packages/core/`), in the app's
  own `src/services/`, and for a screen that already has the same shape, and reuse it. A gap is
  filled in the kit so every app gets it. Copies drift and share bugs.
- **Code copied from another project keeps its licence notice** and gets an entry in the repo's
  `NOTICE.md`. MIT, Apache and BSD licences all require it.
<!-- family-rules:end -->
