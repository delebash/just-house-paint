<!-- SPDX-License-Identifier: MIT -->
# Architecture

The *why* behind the app's main pieces, the trade-offs chosen on purpose, and the lessons built into the code. It
goes with [`README.md`](../../README.md) (*what is where*), [`AGENTS.md`](../../AGENTS.md) (*how we work here*) and
[`PRD.md`](PRD.md) (*what it is for*). The measurements behind each choice are in [`RESEARCH.md`](RESEARCH.md); the
section numbers below point there. The user docs are the other files under `docs/`. This page is for contributors.

---

## A family app — why there is a server

House-paint is a member of the family: the desktop app on the kit's shell, its own Node server (Hono) with one
SQLite database, and the kit's AI stack (`../../../just-core/docs/app-structure.md` §Q). **The server owns the
data** (family rule 2): the houses, their parts, designs, AI photos, every brand's colors and every setting. The
screen keeps nothing that lasts. That is what makes the other ways in work with no extra code: the server on its
own (`npm run server`) with the app in a browser on the home network, behind access tokens; several windows at
once, kept in step by the kit's change counter; a backup that is the database plus the `houses/` folder.

A house is a row plus one folder (`server/src/files.js`): `original.<ext>` (the photo as added, its EXIF
orientation applied), `display.jpg` (what the screen paints on), `thumb.jpg`, `masks/<part>.png` (one 8-bit mask
per part at the display size) and `renders/<id>.png` (the AI photos). Deleting a house deletes one folder.

## Painting on the screen, not by AI

The colors a user sees while choosing are **not** generated. They are computed on the screen from the photo and
each part's mask (`src/services/tint.js`, `painter.js`): in linear light each pixel becomes the paint's color
times how lit that pixel is compared with the part's normally lit level (the 75th percentile of its brightness).
A normally lit pixel shows the paint chip exactly, and the shadows, the texture and the lap lines keep their shape.
On the probe photos this gave a lit ΔE of 0.33–0.64 against the chip, where a plain multiply gave 6–11 and the CSS
`color` blend 5–47 (RESEARCH §5, §9).

Why this way:

- **It is exact.** The point of the app is "what will this paint look like here". A generated picture drifts in
  color; the ratio tint shows the chip's own color on a lit wall, and the ΔE badge proves it.
- **It is instant.** A click repaints in a frame; only a changed mask or the Texture setting is prepared again
  (`painter.js` keeps each part's level and blurred light).
- **A dark finish painted lighter** first loses the old finish's own blotches and grain, not the boards' shadows
  (`calmFinish`, RESEARCH §13). **On it now** — the paint a part has today — sets how new colors read in its light.

This is display math, not data: what is kept (the colors chosen, the designs) goes to the server.

## Finding the parts — SAM 3 on the user's computer

The parts are found by Meta's SAM 3 from text prompts, on the user's own computer (`server/src/segment/`,
`finder.js`). Why:

- **Privacy and cost.** A photo of someone's house stays on their computer; nothing is paid per photo.
- **Text prompts fit the job.** SAM 3 finds "garage door", "shutter", "gutter" from words, so the recipe of parts
  is data (a settings row: each part's prompts, threshold, group and whether it is painted), not code.
- **The body is a subtraction.** "Exterior wall" and "siding" missed gables; the main "house" instance minus
  every other part found covers all the siding (RESEARCH §10). Only the main instance is used, so a neighbor's
  house is left alone; `onHouse` keeps a piece only when enough of it lies on the house (the car, the statue).
- **Every pixel belongs to one part.** Prompts overlap ("door" also takes the garage door, "trim" the gutters), so
  a priority list (a settings row) gives each pixel to the more specific part.
- **A box, not a point.** SAM 3's decoder takes boxes: the Box tool hands it what the user drew (a garage-door box
  scored 0.983 — RESEARCH §10). The photo's encoding is kept for the next box on the same house.

SAM 3 runs on the kit's in-process ONNX runtime. Its preset's `executionProvider: "auto"` puts the image encoder on
the graphics card through DirectML on Windows (1.44 s an encode; it holds about 5.7 GB of the card) and keeps the
rest on the CPU; on the CPU a find peaks at 6.7 GiB of memory (RESEARCH §10). The app hands the kit its own
`onnxruntime-node` (the package stays the app's — the kit's engines plan, D2), and keeps SAM 3's pre- and
post-processing as the kit's vision adapter (`sam3Adapter`).

## The AI photo — generated, then put back and locked

The AI photo is the one generated picture: FLUX.2 [klein] 4B on stable-diffusion.cpp, a masked edit of the photo
(`server/src/aiphoto/`). A model's output alone would change the whole frame (every pixel goes through the VAE)
and drift each color, so the app:

1. hands the model the photo and the union of the chosen parts' masks at its working size (multiples of 16);
2. brings the render back to the photo's full size and **pastes it back only inside the (slightly feathered)
   masks** — everywhere else the pixels are the photo's own;
3. **locks what the model repainted to its paint**: the paint times the render's own normalized lighting, then
   measures each part's normally lit pixels with ΔE2000 against the paint (0.21–0.75 on a lit wall in the real runs).
   Only what the model changed is locked (`lockOnlyRepainted`): a pixel it left as it was — white trim inside a body
   mask — keeps its own color instead of turning paint-colored (RESEARCH §10, "the pink trim"), unless the paint is
   close to the part's old color, when the whole part is locked. So a part the model didn't repaint (a small door
   under a porch) stays as photographed, and the picture's "ΔE … from the chips" — the part furthest off — says so;
4. **draws such a part again up close**: a small part still far from its paint is cut out of the photo with the
   house around it, grown to the same pixel budget so the model sees it large, drawn with a prompt naming it alone,
   and its own pixels take that drawing; every part is locked again, and the close-up is kept only when the part
   came closer and the picture's worst didn't get worse (`aiphoto.compose` `closeUp*`; the porch door 37.77 → 0.57,
   RESEARCH §14). Each one is another drawing, about 15 seconds, named on the task strip.

About 20 seconds a picture on Windows with an 8 GB NVIDIA card (RESEARCH §6, §9–§10). A cloud model to compare
was probed and parked (IDEAS.md: the key's project has no billing for image output).

## The engines are the kit's

Both engines run the way the kit runs llama.cpp (family rule 5; the kit's
`docs/plans/2026-10-24-engines-the-llama-way.md`): their builds are seeded rows, their models catalog rows in the
kit's AI cache (shared with the family's other apps, downloaded only when the user presses the button, each file
checked against its SHA-256 and the drive's room checked first), their features routed by presets
(`parts.find`, `aiphoto.render`, `schemes.suggest`), their graphics-card use booked with the kit's arbiter — so the
AI photo can ask SAM 3 to let the card go, and a chat model can ask the same of both. The screens are the kit's
(the AI page's runtime tabs, `LuEngineNeeded` in place on the house page). Nothing about an engine is the app's
own except SAM 3's adapter and the AI photo's pixel work.

A long server job — finding the parts, the AI photo — is a job on the kit's `JobRegistry`: the route answers 202
with the job, the screen follows it with the kit's `runServerJob` inside `withAiTask` (its progress and Cancel in
the AI tasks panel), and a reloaded window finds the house's running jobs again (`/v1/houses/:id/jobs`).

## Paint colors — no brand data in the repo

The repo ships no brand's colors. The server loads each brand's public list itself, the first time the app opens
(Sherwin-Williams' host also serves Valspar, HGTV Home and Dutch Boy; Behr's index), and keeps it in the
database; Benjamin Moore and PPG / Glidden publish palette files instead, so the app reads the brand's palette
page, follows the file links it shows today and reads each file with the same importers as **Import a palette
file** (`server/src/paints/feeds.js`, `files.js`, `importers.js`). Why:

- **Out of the box, everything works** (the user's decision, 2026-10-18), and a brand's list is used for the
  user's own use only, with the brand's terms said beside its switch (RESEARCH §10; PRD "Outside data").
- **The page, not a fixed file address,** is the source: a file's address changes when the brand republishes it.
- **One row shape** for every source (`normalize.js`); a field the source doesn't give — LRV, exterior, family —
  is empty, never guessed. Discontinued colors are kept but hidden, so a suggestion never names a paint that can
  no longer be bought.
- **Ordering by color** as a store's color wall: the near-grays first, then hue bands, each light to dark; the
  family cuts are the ones that misfile the fewest of the brands' own labels on ~17,100 colors (`order.js`,
  RESEARCH §10). The database runs the same math in SQL, so paging and search keep working.
- **Adobe swatch files** (.ase, .aco) are read by the app's own reader — NOT STANDARD, as no maintained npm reader
  exists (`swatches.js`, checked 2026-10-17).

## Color schemes — always real paints

Every scheme ends as real paints of the chosen brand. Harmony schemes set body, trim and accent as OKLCH targets
around the body's color, then snap each to the nearest paint that keeps the scheme readable (`harmony.js`; every
threshold a settings row). The brand's pairings are the brand's own coordinating colors. The AI's schemes
(`schemes_ai.js`) read the house's current colors from the photo — the median inside each part — ask the model
routed to `schemes.suggest` for JSON through the kit's run path, and snap every color to the brand's nearest paint;
the prompt is the kit's prompt row, edited and tried in the AI Lab.

## Release system and the website

A release is built on GitHub's runners and started only by hand (`npm run release`, JustWrite's way: three runners
cost too much to start on a push). Each platform's build is started on its runner before anything is attached
(`scripts/start-packaged.js`: the window, the server on its own through the app's launcher, the part finder's
engine check), and the AppImage is opened again the way a Linux user opens it. A new release stays a draft until
every file is attached — the installers, electron-updater's feed and the user docs (`docs.tar.gz`) — so an installed
copy's update check never reads a release without its feed. The release starts nothing else: the website,
[just-house-paint-website](https://github.com/delebash/just-house-paint-website), publishes the docs of the latest
release (not of the main branch) when the user runs its `npm run deploy` — no workflow starts another, and nothing
builds by itself (the user's rules, 2026-10-28; the kit's `website/` files, app-structure §19, "An app's website").
