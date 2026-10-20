<!-- SPDX-License-Identifier: MIT -->
# PRD — just-house-paint

> Drafted 2026-10-18 from the user's recorded decisions (`TASKS.md`, "Direction", "Design
> decisions after probe round 1", "Build it all — the go") without an interview — the user said
> "dont stop". **Assumptions the user hasn't confirmed are marked (assumed)**; correct any of them
> and this file changes.

## What it is for

See your own house in real paint colors before you buy paint. You add a photo of your house; the
app finds its paintable parts (the body, trim, doors, the garage door, shutters…); you pick real
brand paints for each part and see them on your photo — the exact paint color, with the photo's
light and texture kept — and the app suggests color schemes. An "AI photo" button can also make a
generated repaint (its colors are the AI's, approximate).

The user's words: "an ai house paint visualizer … The app identifies the parts of the house … and
allows you to change the exterior paint color based on paints from the industry such as sherwin
williams behr … You can upload a picture of your house, choose the section or sections or the app
can suggest some colors based on your current house or your pallet selection".

## Who uses it

Anyone planning an exterior repaint — a homeowner with a phone photo of their house (assumed: not
painters or designers with professional needs in v1). Free and open source (MIT). It runs on the
user's own computer as a family app: the desktop app, or its server with the UI in a browser.

## Features, and how each is proven

| # | Feature | Proven by |
|---|---|---|
| F1 | **Your houses** — add a photo (JPG, PNG, WebP; HEIC is not read in v1 (assumed)), rename, delete; a gallery of your houses | server tests (upload, list, 422 on a non-image, delete removes files); e2e: add a photo through the window |
| F2 | **Find the parts** — one click finds body, trim, front door, garage door, shutters, columns, railings, gutters, chimney, plus what isn't painted (roof, windows, stone, brick, lamps); the first run downloads the part-finding model (~3.4 GB) with progress; once per photo | the recipe's unit tests; a real-model test on the three probe photos (env-gated) asserting the garage door and the body are found |
| F3 | **Fix the parts** — show outlines; brush to add or erase a part's area; tap a spot to select what's there; move an area to another part | mask-operation unit tests; the tap route's test (real model, gated); e2e: a brush stroke changes the mask |
| F4 | **Paint** — pick a part, pick a brand color (search by name or number, filter by color family and exterior use), see it at once on the photo; a badge says how close the painted wall is to the paint chip (ΔE) | tint unit tests (ΔE < 1 on synthetic surfaces); the measured ΔE on the probe photos; a component test |
| F5 | **Paint colors** — every brand's public list loads by itself at the first start, one after another ("Load automatically" per brand on Paint colors, on until you turn it off — the user's decision, 2026-10-18: "out of box eveything just works"), with the brand's terms noted; or import a brand's official palette file (ASE, XLSX, CSV); the 7 launch brands: Behr, Sherwin-Williams, Benjamin Moore, Valspar, Glidden + PPG, HGTV Home, Dutch Boy. The app ships no brand data | loader and importer tests on synthetic files; a live test (env-gated) per feed |
| F6 | **Color schemes** — the brand's own coordinating colors; schemes built from a color you like (complementary, analogous, triadic, classic light-trim) snapped to real paints of your brand; AI suggestions from your house's current colors and what won't change (roof, stone) | harmony unit tests; the AI feature's route test with a stub engine |
| F7 | **Compare and keep** — before/after slider; save several designs per house; switch between them | store and route tests; e2e: save a design, reopen it |
| F8 | **AI photo** (an option button) — a generated repaint inside the parts' outlines only, pasted back into your photo, the paint color locked; says plainly its colors are approximate; local engine (needs an NVIDIA or Vulkan GPU; ~18 s on an RTX 2070 SUPER; ~9 GB of downloads the first time) | argument/progress/paste-back tests; a real run test (env-gated) |
| F9 | **Export** — save the painted image (PNG/JPEG) and the color list (part · brand · number · name) | route and component tests |
| F10 | **The family app** — the AI area, settings (appearance, backups, storage, server, logs, updates, about), help pages, the task strip, the desktop app with tray, headless use in a browser | the family guard; the template's tests |

## Outside data, accounts and services

- **Brand color lists** — loaded by themselves from the brands' public lists (Sherwin-Williams' host also
  serves Valspar, HGTV Home and Dutch Boy; Behr's query index) unless the user turns a brand's "Load
  automatically" off (the user's decision, 2026-10-18 — TASKS), or imported from the brands' official palette
  files. Each brand's terms limit automated access and reuse (RESEARCH §10); the app
  says so beside the switch, names colors as the brand does ("SW 7008 Alabaster") with a
  not-affiliated notice, and shows an on-screen color disclaimer. No request to the brands is sent
  (option D, dropped 2026-10-19 — TASKS).
- **Model downloads** (Hugging Face): SAM 3 in ONNX form (samexporter's export; Meta's SAM License),
  FLUX.2 [klein] 4B, Qwen3-4B and the klein VAE (Apache-2.0). **Engine download** (GitHub releases):
  stable-diffusion.cpp (MIT).
- **AI text features** go through the family's AI stack: a local model (llama.cpp) or the user's own
  cloud keys. No account is required for anything.

## Out of scope for v1

Live camera / AR view · paint quantity and cost estimates · ordering samples · interior rooms ·
sharing designs online · the phone app (Quasar's Capacitor mode stays for later) · a cloud AI photo
(Gemini's image models — allowed through the kit later) · HEIC photos (assumed).
