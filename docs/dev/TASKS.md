# TASKS — the live open-work tracker (just-house-paint)

> One entry per open item, with a pointer to its detail. **Close = delete** — git and the plan
> docs keep history. Decisions are recorded as the exact text the user approved. A tracker line is
> a claim, not evidence. Facts live in [`RESEARCH.md`](RESEARCH.md).

## Direction — decided 2026-10-17
STATE:  DECIDED 2026-10-17 (the first session). The user's words, verbatim:
        - The request, whole: "i want an ai house paint visualizer web app using quasar js framework,
          examples of the app are https://www.sherwin-williams.com/en-us/color/color-tools/color-visualizer/cvw/,
          https://www.homegpt.app/ https://housepaint.ai/.  The app identifies the parts of the house
          paint such as door walls stucko garage trim ect and allows you to change the exterior paint
          color based on paints from the industry stuch a sherrwin williams behr, it.  You can upload a
          picture of your house, choose the section or sections or the app can suggest some colores
          based on your current house or your pallet selection, do some research on apps like this and
          features and come up with a plan, you can mock the app in the real app wihout hooking up all
          the features so i can approve the look and feel and flow first.  Do some we research, come up
          with features and a mock, use latest quasar update the deps, call it just-house-paint.  Can
          this run fast on my 8gb card to re draw the image of the house based on user input like using
          nano bannon or whatever ai these apps use, find out what and how these example apps i have
          listed and ones you research use the ai and what models and let me know if we can do a local
          run app like this effeciantly."
        - "we are focusing on a node web app right now but quasar allows use to create electron and
          als we prob will wont a mobile app later which quasar has functiosn for as well".
        - "it does not have to be limited to gpu … as long as it runs fast we can use cpu, we should
          resuse anystuff we have already built if it works, like our shared llm and ui controls".
        - "If we have to use python we can but if there is a way to run our image indetifiers like
          we have with audio cpp and lama cpp lets do it".
        - "im ok with non standard as long as we have done the researcch and this is the best way".
        - "they my be fast enough event running on cpu may be fast enough, but it is option and this
          should be cross platform".
        - Asked who it's for, cloud, brands, data store and hosting — answered: "1 for anyone open
          source free 2 cloud is allowed that fits with our llm kit we can use anyting se we add
          imaging to our kit i think 3 behr and shwerwing williams where do the other apps get the
          paint info from? 4 lets stick with our current just app setup and use sqlite our apps
          should be reusing andusing same type of setup as it is the just-family with ai, 5 hosted,
          but that could be local like we have setup with our other just apps, i think we design it
          same way with server and gui, server should be same since we already worked out all the
          kinks and our llm kit dependds on it, correct let stick to family design".
        - "structure it like the other just apps like jv, we can go ahead and do electron but i dont
          think we really need electron we can just use the web, both jv and jw are designed for
          just web use mostly so stick with our other app design".
WHY:    The shape every later plan follows: a family app (the kit's `template/`, its server and
        SQLite), imaging added to the shared kit, cloud models allowed through the kit, open source;
        built and tested in the browser against the app's own server, Electron mode kept as the
        template carries it.

## Design decisions after probe round 1 — decided 2026-10-17
STATE:  DECIDED 2026-10-17. The user: "your rec go", on these recs as shown:
        - **The AI photo is an option button in v1** — the user, 2026-10-17: "you can do the ai photo
          i thought we added that as option button in the first version". It repaints only inside
          the outlines (round 2: `-i` + `-r` + mask, then a pixel paste-back — aligned, no seams,
          ~18 s on this machine); its colors are the AI's, approximate. (was: my rec's line "If they
          don't come out clean, the button waits for v1.1" — my wording, not the user's, and not
          what the user meant; replaced 2026-10-17.)
        - **Paint data** — "B as a setting you turn on, with C as the fallback and D in parallel.
          The repo ships no brand data. Colors are named "SW 7008 Alabaster" with a not-affiliated
          notice and an on-screen color disclaimer." (B: the server loads each brand's public list
          on first use and caches it in SQLite; C: the user imports the brand's official free
          palette file; D: ask Sherwin-Williams and Behr for permission. RESEARCH §10.)
        - **Where models run** — "the server for everything to start, because that reuses the kit
          and matches JustVoice and JustWrite. Running in the browser can be added later for
          instant taps."
        - **Test round 2** — "your photos, first; a dark house painted white; subtraction with the
          material check; "tap one, find all"; tint v2; the sam3.cpp Vulkan build against CUDA;
          the standard ONNX Runtime route; masked inpainting, only if the AI photo stays."
NOT:    D sends nothing by itself — a request to the brands is drafted for the user to send.
LATER:  the launch brands (the user, "your rec on the rest", 2026-10-17, on the rec as shown):
        "launch with 7 brands. Behr, Sherwin-Williams, Benjamin Moore, Valspar, Glidden + PPG (one
        numbering system), HGTV Home and Dutch Boy" — loaded from the public feeds (SW host: SW,
        Valspar, HGTV Home, Dutch Boy; Behr) or imported from the official files (Benjamin Moore
        ASE, PPG/Glidden XLSX); PaintDB kept out of the default (RESEARCH §10).
DECIDED 2026-10-18 (the user: "yes create repo your rec on all go"): the Vulkan SDK is skipped —
        ONNX Runtime's GPU paths (DirectML, WebGPU) need no SDK and are the standard cross-platform route.
        (Was: PRD vs SPEC, the pre-commit hook, the `AGENTS.md` design, the skill and
        `just-sqlite-sync`'s CI — all decided 2026-10-17 in the kit's TASKS, "A standard start for
        every new just app".)

## Feasibility probe on this machine [2026-10-17]
STATE:  ROUNDS 1 AND 2 DONE 2026-10-17 — the user's go: "so yes go do your tests when ready".
        Cross-platform engines only (TensorRT deferred by the user). Results: RESEARCH §9 and §10's
        round-2 entries (finding parts, ONNX Runtime on the CPU, tint v2, a dark house, masked AI).
        Throwaway: inputs and outputs in `data/probe/` (gitignored).
OPEN:   the user's own house photo(s) (asked for, not yet given) and a ΔE check on one; ONNX Runtime's
        DirectML and WebGPU timings (not yet run); dark-to-light tint shows the old wood grain (tint v2
        helps only a little); a cloud render (needs a Gemini key). The brand request for D is drafted
        (`docs/plans/2026-10-18-brand-permission-request.md`, 2026-10-18) — for the user to send, edit or drop.

## Build it all — the go [2026-10-18]
GO:     the user, verbatim: "keep going finihs it all i want all this done and a complete working app
        for just-house-paint, dont stop but always rethink your decisions and recs adverserially go on
        coding your recs dont stop do it all". So: the PRD is drafted from the decisions above (no
        interview — the user said don't stop; it lists what it assumed, for the user to correct), the
        app is created from the complete template, and every v1 feature is built and tested.

BUILT (2026-10-18; plan `docs/plans/2026-10-18-v1.md`) — generated by `/new-just-app` from the complete
        template, the staged engines, routes and screens moved in; the notes example removed. Your houses,
        the house page (Parts · Colors · Schemes · Designs, the Konva canvas, brush / eraser / box, before /
        after, texture, save image, copy the color list), Paint colors (load a public list, import a file,
        remove), the AI photo, Settings → General and Advanced, the help pages. Run for real on house1
        (RESEARCH §11). Verified: lint; 311 server tests (+ the real SAM 3 test); 36 renderer tests (the
        painter, the stores, Your houses, the house page, Settings mounted); i18n lint 0; the e2e smoke on
        the desktop build, 13/13; the family guard.
OPEN:   - the user's own photos not yet run through the app (house1–3 done, RESEARCH §11);
        - trim recall: better with the new default recipe, but corner boards, friezes and skirts still land
          in the body (RESEARCH §11) — the Box tool is the fix today;
        - the AI photo's time (22–61 s) and the AI schemes' (16–99 s) vary widely between runs on the same
          inputs (RESEARCH §11) — not explained;
        - a browser on a server that requires access tokens can't use the app at all: no family app gives
          the kit's transport a token (the kit's TASKS) — the pictures now go through that transport
          (the kit's `UiServerImage`, 2026-10-18), so they follow when it does;
        - the phone build: the server bundle can't carry sharp, onnxruntime-node or sd-cli; Capacitor stays
          for later (PRD: out of scope for v1).

## The repo and the recs — the go [2026-10-18]
GO:     the user, verbatim: "yes create repo your rec on all go".
DONE:   the GitHub repo — https://github.com/delebash/just-house-paint, public (as the family's repos and
        the PRD's "for anyone open source free"), MIT (the LICENSE file), `main` pushed.
DECIDED (my recs, as built and shown in the report of 2026-10-18 — the user's go above covers them):
        - Labels: how each brand's code is shown — built as SW "SW 7008", Behr and Benjamin Moore the code
          alone, Valspar "8002-45G", PPG codes as they are ("PPG…"), HGTV Home "HGSW6421", Dutch Boy "311-7DB";
          the not-affiliated notice and the on-screen color disclaimer wording.
        - Schemes: the harmony thresholds are proposals, not measured; "classic" gives the door the
          complementary hue (a green body got a purple door on SW's data).
        - 30 HGTV Home colors are only in SW's `/hgtv` list, not `/lowes` (which has the LRV) — left out.
        - The screens' words are mine, built as shown (the catalog `src/i18n/locales/en.json`): "Your houses",
          "Paint colors", "Find the parts", "AI photo", "Save image", "Copy the color list", the tabs Parts ·
          Colors · Schemes · Designs, "Ask the AI" / "Suggest schemes", "Install (3.1 GB)", and the help pages.
        - Settings → Advanced edits the structured settings as JSON (the finder's parts, the priority, the
          scheme roles, the harmony rules, the AI photo's prompts and compositing) — a raw JSON editor, not a
          form per field.
        - The AI's color-scheme prompt is a kit prompt row (`schemes.suggest`, edited in the AI Lab), not an
          app setting — the family's "prompt-row-owned" kind (app-structure §11); the staged
          `/v1/ai/prompt-preview` route went with it.
NOT STANDARD — DECIDED 2026-10-18, the user, verbatim: "your rec even non standard but think on your rec
        again go on all finish the app". Each rec attacked again before it was kept (RESEARCH §4, §6, §10):
        1. The Adobe swatch readers (`server/src/paints/swatches.js`) — KEPT: ASE in ~80 lines and ACO,
           checked on Benjamin Moore's and PPG's real files. The standard option, adobe-ase 1.0.0 (one
           release, 46 downloads/week), reads ASE only; ACO has no package at all.
        2. SAM 3's pre- and post-processing (`server/src/segment/`), our JS port of samexporter's Python
           around ONNX Runtime's official binding — KEPT: transformers.js v4 runs "SAM3 Tracker" with
           points and boxes only, and the finder needs SAM 3's text prompts ("trim", "door"); sam3.cpp
           has no upstream CUDA build. Measured equal to sam3.cpp (mask IoU 0.991).
        3. The AI photo around sd-cli (`server/src/aiphoto/`) — KEPT, all three parts:
           - sd-cli per render, its progress read from its log lines: a resident sd-server would hold
             ~6.5 GB of the 8 GB card the part finder (~5.7 GB) and the chat model also need; a process
             per render frees it every time. The log format is pinned to the release and fixture-tested.
           - the feather, paste-back and color lock as our pixel loops: no library does the lock.
           - the models and engine in the app's own folders (`data/models/*`, `data/engines/sdcpp`), not
             the kit's model cache: the attack reversed my first "move them into the kit's cache" — the
             kit's "Clear models cache" wipes the cache's whole `hf/` with a guard that knows only the
             chat model (not the finder's open ONNX files or a running sd-cli), and a SHARED cache would
             let a sibling app's Clear delete these 12 GB, which come back only by Install. What it
             found instead: Settings → Storage didn't count them — now it does (the kit's
             `makeDiskRouter` extra buckets: houses, the part finder, the AI photo).

## How the app is started [2026-10-17]
STATE:  the Claude Code setup items 1–8 became the `/new-just-app` skill's 8 decisions ("your rec on
        all go", 2026-10-17 — the kit's TASKS, "A standard start for every new just app"); items 9–12
        applied ("9-12 your rec go"). This app is the skill's first real run, after the PRD interview;
        the skill waits on the complete template (the kit's TASKS); the kit's rename to just-core,
        which the template waited on, is done (2026-10-18).
