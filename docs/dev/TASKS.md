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
OPEN:   dark-to-light tint shows the old wood grain (the Texture slider softens it); a cloud render (needs a
        Gemini key). The brand request for D is drafted
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
OPEN:   - the user's house: the gable medallions in the body are left for the Eraser / Box (the SUV-window trim
          line went when window trim became its own part); the obstruction test set is for later (below);
        - trim recall: better with the new default recipe, but corner boards, friezes and skirts still land
          in the body (RESEARCH §11) — the Box tool is the fix today;
        - the AI photo's time (22–61 s) and the AI schemes' (16–99 s) vary widely between runs on the same
          inputs (RESEARCH §11) — not explained;
        - a browser on a server that requires access tokens can't use the app at all: no family app gives
          the kit's transport a token (the kit's TASKS) — the pictures now go through that transport
          (the kit's `UiServerImage`, 2026-10-18), so they follow when it does;
        - the phone build: the server bundle can't carry sharp, onnxruntime-node or sd-cli; Capacitor stays
          for later (PRD: out of scope for v1).

## Wide-color photos — the most accurate colors [2026-10-18]
ASKED:  the user, verbatim: "the orignal picture is different color from one uploaded in our current dev app, why";
        "example orig is on left one in our app is on right the colors do not match it should be same photo";
        "whateve we need to do to make it match the original image can we auto detect and add what is needed?";
        "i want you to think on the photo problem above, i want  the best most accurate results, so whateverr we need
        ot acieve the most accurate results give me your rec". Found (RESEARCH §11): an iPhone Display P3 photo on a
        wide-gamut screen; the app flattens to sRGB, clipping strong reds/oranges; not the HDR gain map.
MY REC (shown 2026-10-18): 1. P3 end to end — the display copy keeps P3, canvases in display-p3, the painter in
        linear P3 (paints converted exactly, ΔE from P3), the eyedropper back to sRGB for matching, exports tagged P3,
        the AI schemes / AI photo given sRGB; 2. drawing: 5a — a native P3 canvas under Konva (NOT STANDARD; Konva
        has no color-space option) — or 5b, patch Konva; 3. (right after) the paint on the house now, picked per part,
        calibrates the light exactly; 4. checks: the user's house in Photos vs the app within ΔE 2, a P3 test image
        vs Chromium's own rendering within ΔE 1, the painter's tests in P3. Dropped after the attack: the brands' Lab
        (computed from hex), the HDR gain map (Photos doesn't apply it on this screen), higher bit depth.
GO:     the user, verbatim: "your rec on all go" (2026-10-18). 5a is NOT STANDARD: asked for the user's word on it
        by name before it is built (a blanket go doesn't cover it).
ORDER:  the user, verbatim: "are you doing thsese ? - Show lit and shaded samples next to the chip on the Colors tab ... -
        A "Light" slider that brightens the photo's lighting"; then "do the stuff that lets use see the rosemary more
        accuralty first" and "do both" (2026-10-18): the samples and the Light slider first, then 3, then 1, 2, 4.
3:      BUILT 2026-10-18, seen on the user's house the same day — the Colors tab's switch **The new color | On it now** (as shown
        to the user before the go): in On it now a click records the paint the part has today (PUT
        /v1/houses/:id/current-paints, a `current_paints` table, kept when the parts are found again), the line
        "On it now: <paint> [Clear]"; the light on the part = the photo's median on its normally lit pixels ÷ that
        paint, per channel in linear light, capped 0.25–4 (services/tint.js lightGain); every paint, the tones, Compare
        and Save image use it. Verified: 326 server and 69 renderer tests (the gain, a mounted pick → PUT → darker
        tones → Clear), lint, i18n.
        ASKED then (2026-10-18): the Parts tab's ΔE (still against the chip, so a known paint now raised it by the
        light's own effect) — my rec: against the paint in the part's light; the AI photo's lock (still to the chip) —
        my rec: the same light; and may I restart the dev app. DECIDED, the user, verbatim: "on above questions your
        rec all go". BUILT 2026-10-18: ΔE against the chip in the part's light (tint.js litHex); the AI photo locks
        to it — the route sends each part's paint now, the server reads the light off the photo (aiphoto/pixels.js
        lightGain, the cap `aiphoto.compose` gainLimits, an unedited compose upgraded). Verified: 330 server and 69
        renderer tests, lint, i18n; then the real app on the user's house (body: Ancient Marble on it now, Rosemary
        the new color — the tones in that light, ΔE 0.5, Clear back to none) and the e2e smoke 13/13.
GO:     5a — told "5a is non-standard, though, so per your rules it still needs your word by name", the user replied,
        verbatim (2026-10-18): "it covers finihs everything rethink on anythink you need to but i want all tasks done
        all suggestions done"; told "I'm taking it as your word on 5a … say stop if you didn't mean that", the user:
        "go". So 1, 2 (5a) and 4 are built now.
RETHOUGHT (2026-10-18, on the user's "rethink on anything you need to"): 1, 2 (5a) and 4 NOT built — measured first
        (RESEARCH §11, "The gamut diagnosis above was wrong"): the app's copy of the user's photo equals Chromium's own
        rendering of the original (coral 149/83/71 vs 150/83/70), the coral is inside sRGB, 0.22% of the photo lies
        outside sRGB at all, and this screen gets sRGB from every app (Windows SDR, no display profile; Chromium's
        color-gamut is srgb). A P3 pipeline and a non-standard canvas would change ~0.2% of pixels, only on a
        wide-gamut-aware screen. Shown to the user in the report, for their word if they still want it.
STATE:  3 built and checked on the user's house (On it now: tones in the part's light, ΔE 0.5, Clear restores it).
DECIDED 2026-10-19 (mine, under the user's "decide and finish" below): 1, 2 (5a) and 4 are NOT built. Attacked:
        the app is for anyone and the macOS build runs on wide-gamut Mac screens, where Chromium does show P3 —
        but every brand paint is an sRGB color (the brands publish hex/RGB), so a painted part is the same on any
        screen; only the unpainted 0.2% (strong reds and oranges outside sRGB) would gain, at the cost of a
        NOT STANDARD canvas under Konva. Parked in IDEAS.md ("Wide-color photos") with the measurements.

## Choices made while building — decided [2026-10-18, 2026-10-19]
DECIDED 2026-10-19 (mine, under the user's "decide and finish" below — each attacked first): every CONFIRM
        stays as built; Linux ships the AppImage only (it runs on every distribution and electron-updater
        updates it; a .deb would publish a maintainer address, and no one is named); the installers ship
        unsigned for v0.1.0 (signing needs a certificate bought in the user's name — the one thing here that
        waits on the user: IDEAS.md, "Signed installers", with the free SignPath Foundation route for open
        source); macOS stays Apple silicon only (Apple sold its last Intel Mac in 2023, and two arch builds
        would each write the update feed's latest-mac.yml); the two review suggestions BUILT 2026-10-19 —
        a brand's new list names the designs it left a color short (and Remove names the designs first; the
        Parts tab says "not in the loaded colors"), and Find the parts again keeps the parts changed by hand
        (a checkbox, on; the kit's dialog got the checkbox field).
WAS:    - Reset's labels, built as proposed: "Remove all colors" and "Back to “{design}”";
         - the old design's trim offer: a part painted by hand drops out of it; it stays across tab switches; it
           sits under the designs list;
         - Settings → About's line, written for this app: "See your house in real paint colors before you buy
           paint: its parts found on your computer, real brand paints in the photo's own light, color schemes,
           designs and an AI photo.";
         - leaving the house with colors no design holds asks first — "Leaving the house drops them." / Leave;
         - the release's version: v0.1.0 (the first public one; the family's first releases were 0.1.0).
WAS ASK: - the installers aren't signed (no certificates): Windows shows SmartScreen's warning, macOS Gatekeeper's —
           signing needs a code-signing certificate (Windows) and an Apple Developer ID ($99/year), the user's call;
         - macOS: built for Apple silicon only (the runner's arch; an Intel or universal build needs both archs'
           native modules) and never opened on a real Mac — the help says how to open an unsigned app;
WAS ASK: - wide color 1, 2 (5a), 4 — not built after the measurement (above): still wanted?
         - a Linux .deb: it needs a maintainer address published in the package ("name <email>") — which one, or
           the AppImage alone;
         - two review suggestions not built (each needs screens and words): name the designs whose paints a brand
           reload dropped; keep the parts fixed by hand when the parts are found again.

## The obstruction test set — agreed, for later [2026-10-18]
ASKED:  the user, verbatim: "one way to test would be to go grab a bunch of pictures of houses with cars
        trees and other things with partially obscructions, keep iterating those test pictures and your code
        until you can get the best identifier results possible, think your your solutons each time
        adversarily, i mean you could use object identifier and then exlude those object or whatever you
        think is best, what do you think, maybe the identifier is working well now, let me know."
MY REC (shown 2026-10-18): ~25–30 freely licensed house photos from Wikimedia Commons, chosen for cars,
        trees, fences, people and bushes in front, kept in `data/probe/` (gitignored, never committed);
        every overlay reviewed and its false and missing parts counted per photo, into RESEARCH, so each
        change is measured on the same set; obstacles cut out with SAM 3's own text prompts ("car", "tree",
        "person", "bush" — no second model) only if the set shows the "stays on the house" rule letting them
        through, since each prompt costs ~2 s a photo and a wrong match removes paint. Downloading the
        photos needs the user's OK when it starts.
DECIDED: the user, verbatim: "i agree with your testing we will do it later save waht you need to".
STATE:  later — not started.

## The repo and the recs — the go [2026-10-18]
GO:     the user, verbatim: "yes create repo your rec on all go".
DONE:   the GitHub repo — https://github.com/delebash/just-house-paint, public (as the family's repos and
        the PRD's "for anyone open source free"), MIT (the LICENSE file), `main` pushed.
DECIDED (my recs, as built and shown in the report of 2026-10-18 — the user's go above covers them):
        - Labels: how each brand's code is shown — built as SW "SW 7008", Behr the code alone, Benjamin Moore
          "BM HC-154", Valspar "Valspar 8002-45G", PPG codes as they are ("PPG…"), HGTV Home "HGSW6421", Dutch Boy
          "Dutch Boy 311-7DB";
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

## Finish everything, then a full release — the go [2026-10-18]
GO:     the user, verbatim: "your rec on all go, if you dont find anymore problems or suggestiosn then doa full release,
        if you have more problems or suggestions fix them on your rec keep going until you have no more porblems and do
        a release"; then "it covers finihs everything rethink on anythink you need to but i want all tasks done all
        suggestions done"; then "go".
PLAN:   the e2e smoke and On it now on the user's house; Order by color + Color family; wide color 1, 2 (5a), 4; every
        open item above; a review pass, its findings fixed; then the release (the family's way: JustWrite's manual
        release workflow, the template first).
GO:     the user, verbatim (2026-10-19): "you can find and stop any process yourself do it, i aksed you to finish
        everything think adverserial on your rec keep going, i dont want you to say things like for your word i want
        you to decide and finish all things, think adversiarly take your recs complete everythig go!"
ORDER (mine, attacked against "everything, then one release"): v0.1.0 once this app's own items are done; then
        the kit and template items (the Settings sections into the kit, the warm-start help, the upload example,
        the phone, the browser's token); what of those reaches this app ships as v0.1.1 — which also proves the
        installed v0.1.0 updates itself, the one path nothing else tests.
STATE:  RELEASED v0.1.0 2026-10-19 — https://github.com/delebash/just-house-paint/releases/tag/v0.1.0 (tag 96fec1d,
        the kit at 6179b0b; run 39301532253, all three platforms): the Windows .exe, the macOS (Apple silicon) .dmg
        and .zip, the Linux AppImage, their blockmaps and latest.yml / latest-mac.yml / latest-linux.yml, every file
        the feeds name present. Before the tag: the smoke 13/13 on the kit's release commit; the installer built
        and installed (per user, /S) and started as a user starts it (RESEARCH §12): an older install's data folder
        upgraded (version 0.1.0, its seven brands), a fresh folder (brands loading by themselves), the user's house
        photo with its parts found by the INSTALLED app (10 parts, 63.7 s — the packaged onnxruntime-node and
        sharp), the window's close stopping every process. Found and fixed on the way: the smoke's version literal;
        a release now builds the kit's tested commit (`core_ref`, the guard's check 19); release.js said a started
        run had failed (execSync's null).
NEXT:   v0.1.1 — the kit and template items (ORDER above), then the installed v0.1.0 updating itself to it.

## The review before the release [2026-10-18]
FOUND (a read-only review of the renderer, each traced through the code; to fix before the release):
        1. Find again finishing after the house page was re-opened leaves the old outlines (the new page
           loads only missing keys) — a later stroke or Undo PUTs an old-based mask over the new one;
        2. the store's aiPhoto / box / open write into whichever house is open when they finish (A's AI photo
           lands in B's list);
        3. leaving the page within 600 ms of a stroke drops its save;
        4. Undo / Redo don't restore the open design (Save then overwrites it with the draft);
        5. a drag released outside the canvas leaves the brush / box / pan on;
        6. a failed mask load becomes an empty outline (a stroke then wipes the real one);
        7. Compare's design side goes stale after Save, and a late load overwrites a newer choice;
        8. the Schemes and Colors tabs' loads aren't ordered (a late response wins); the search timer outlives
           the tab;
        9. touch panning reads clientX off a TouchEvent (NaN view);
        10. job polling adds an abort listener every 400 ms.
        Suggestions: ask before leaving with unsaved colors; keep the zoom when the canvas resizes; clear the
        "from the photo" hint when the picker sets the color; keep a stroke made while Undo saves; the
        designs' paints loaded with the house.
        FIXED (renderer, all ten and the five suggestions; also a pending save now goes to the house it was
        drawn on, and finding the parts writes only into its own house) — with tests.
FOUND (a read-only review of the server):
        1. nothing keeps GPU jobs apart: an AI photo frees the finder mid-find (the find fails), a find or box
           reloads SAM 3 beside sd-cli, two houses' AI photos run two sd-cli at once;
        2. paints without a code collapse into one row (`brand:null`), the count says otherwise;
        3. Settings → Advanced saves rules that break later (a `minus` naming a removed part, unknown scheme
           kinds, a mistyped compose value) — 200, then every run fails;
        4. a design deleted while its AI photo renders: the render's row fails its foreign key, the PNG stays;
        5. the AI photo's status says installed when the pinned tag or the backend changed;
        6. deleting a house doesn't cancel its jobs;
        7. a truncated or huge photo → 500 instead of 415; a rotated PNG re-encoded to a 256-color palette;
        8. Cancel during a commit reports "cancelled" though the work was saved;
        9. names of only spaces are saved as "";
        10. a second AI photo while one runs returns the first (new colors ignored).
        Suggestions: a body limit before reading uploads; designs that lost a paint named; leftover masks
        removed after a re-find; hand-made parts kept on a re-find (offered); the model check cancellable.
        FIXED (server, all ten — the graphics card one job at a time, 409 "gpu-busy"; Advanced's values checked;
        the pinned engine; intake errors 415; codeless paints left out with a warning; Cancel after the commit
        is done; names need a non-space; deleting a house stops its work) and three suggestions: upload limits
        (the kit's new `uploadLimit`), leftover outlines removed, the model check cancellable. The other two
        BUILT 2026-10-19 (decided, above): naming designs that lost a paint, and keeping hand-made parts on a
        re-find.
FOUND (docs and this tracker against the code): the releases page empty until the first release; whats-new
        says two brands are imported (all seven load); Settings → About's blurb is the template's; paint-colors
        says codes are shown as the brands write them (BM / Valspar / Dutch Boy prefixes); the troubleshooting
        quote; painting.md's "the light one is the chip"; Add the part offers only paintable parts; four Part
        finder settings, not two; "Settings" vs "App Settings"; features no page explains (design rename/delete,
        AI photo reopen/delete and its ΔE line, No color, Show more, the Parts tab's share / edited / staying
        group, Ctrl+Shift+Z, the theme button, the Server / Backups / Appearance / Storage sections); README
        (iOS, migration v3, services list, the kit's husky note); stale TASKS status lines.
STATE:  FIXED — renderer 88bb457, server 3482b28, docs 77f950a.

FOUND (a second pass — today's own changes reviewed for regressions):
        1. the release workflow's `npm ci` fails in the kit's ui (no lockfile — it is gitignored) on every runner;
        2. the Linux deb needs a maintainer email (electron-builder refuses);
        3. Undo after "Save as a new design" or a delete reopens the wrong or a deleted design;
        4. Advanced refuses every harmony save on the user's database (an old untouched default with a retired
           key; and classicAccentHues isn't a pair);
        5. AI schemes refused while the card is busy even with an online AI;
        6. two quick Undos of one outline can save out of order; 7. a disk error on upload reads "Not a photo";
        8. updates switched on before the first release (fine once it is out); a lost open() race could show a
           load error (no path reaches it today).
        FIXED (all, with tests): the workflow installs ui with `npm install`; Linux ships the AppImage (a .deb waits
        on a maintainer address — below); Save-as / delete amend the current record's design, Undo drops a deleted
        one; retired harmony keys pass, only ranges must be pairs, the old untouched harmony default upgrades
        (b11d8afd…, checked against 27f4140^); the schemes wait only on the local model (the kit's resolveRoute);
        one part's saves queue; only sharp's reading is "not a photo"; a lost load stops quietly.
        The release's dry run (2026-10-18, run 39191195670, `publish: false`): Windows, macOS and Linux all built.
STATE:  FIXED — the e2e smoke and the installed app wait on port 17499 (a leftover server; the user stops it).

## How the app is started [2026-10-17]
STATE:  the Claude Code setup items 1–8 became the `/new-just-app` skill's 8 decisions ("your rec on
        all go", 2026-10-17 — the kit's TASKS, "A standard start for every new just app"); items 9–12
        applied ("9-12 your rec go"). This app was the skill's first real run (2026-10-18), from the complete
        template, its PRD drafted without an interview (the user's "dont stop").
