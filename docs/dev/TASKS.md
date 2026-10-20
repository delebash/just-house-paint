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
DROPPED 2026-10-19 — D: the user, verbatim: "no letter we wont do this remove it". The draft request to the
        brands (`docs/plans/2026-10-18-brand-permission-request.md`) is deleted; B and C stay as built.
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
OPEN:   a cloud render (needs a Gemini key). (The dark-to-light grain: FIXED 2026-10-19 — "Fix the weak spots" below.)

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
OPEN:   - the user's house: the gable medallions — FIXED 2026-10-19 (the Decorations part, "Fix the weak spots" below);
        - trim recall: the doors' casings FIXED 2026-10-19 (below); the corner boards, frieze and skirt of a one-color
          house stay a Box-tool fix — SAM 3 knows no word for them and its find-all-like-this takes whole walls
          (RESEARCH §13), and the help says so;
        - the AI photo's time — EXPLAINED 2026-10-19 (RESEARCH §12): other programs on the same card (another
          family app's resident AI model); the card free, 20.2–20.4 s, also right after the part finder; troubleshooting
          says so; a hint naming what holds the card is parked in IDEAS.md. The AI schemes' 16–99 s are the model
          loading again after server restarts (§11) and the same sharing;
        - a browser on a server that requires access tokens — DONE in v0.1.1 (the kit's token sign-in, 3c8c3d2):
          the connection page asks for the token, or the address Server copies carries it; every request (the
          pictures too, through the kit's transport) sends it;
        - the phone build: the server bundle can't carry sharp, onnxruntime-node or sd-cli; Capacitor stays
          for later (PRD: out of scope for v1).

## Fix the weak spots — the go [2026-10-19]
GO:     the user, verbatim: "fix we spots and anything else, do it all dont keep stopping and saying stuff like we
        spots, if you think something more needs doing than do it, think on it adversialy and fix it or do it until
        there are 0 issues left!!!!!!!!!" — after "Paint brands: … what is this?" and "no letter we wont do this
        remove it" (the letter: dropped, above).
DONE:   (each measured first, RESEARCH §13)
        - the dark-to-light grain: a dark finish (L* under 45) painted 15+ L* lighter loses its blotches and grain
          along the boards, its board lines and shadows kept; stucco and light walls unchanged — running-bond brick's head joints soften (the fifth review) (tint.js
          calmFinish; tests; painting.md);
        - the gable medallions: a Decorations part ("decoration", only what lies on the house itself — no garden
          statue), painted the trim's color by a scheme;
        - trim: the doors' casings ("garage door frame", "door frame"); a piece must lie 15% on the house itself (a
          fence's end board was painted as trim on house3); existing installs at the old defaults get the new
          parts list, priority and scheme roles (previous_defaults.js); a house found before needs Find the parts
          again (keeping hand changes) to gain them;
        - the AI photo names the other programs that held the graphics card when it started (over
          `aiphoto.sharedGpuNoteMb`, 1024 by default, in General) — was in IDEAS;
        - parts stay on THIS house: the house rule uses the main "house" instance alone, not every house in
          the photo (the obstruction set: a neighbor's windows, doors and soffits were painted — c02, c04, c07);
        - the packaged app is started on every release runner before anything is attached (the template's
          scripts/start-packaged.js and workflow step, the guard checks it).
RULE:   the user, verbatim (2026-10-19): "why are we doing a release, i said do a release only after we have 0 issues
        0 suggestion 0 things to fix, and yet you did a releaw?" — then, told the run was a dry run (nothing published):
        "ok it was dry run continue". So: NO release until nothing is open — no issue, no suggestion, nothing to fix.
        v0.1.1 and v0.1.2 went out while items were open (my mistake). A dry run (`publish: false`) publishes nothing
        and stays allowed for testing the builds.
FOUND by the dry run (39339201987, the new start check): the Linux AppImage never starts — sharp's libvips
        (`libvips-cpp.so.8.18.7`) stays inside app.asar (only `*.node` is unpacked; a `.so.<n>` name isn't seen as a
        library), so the server exits at its first import; v0.1.0–v0.1.2's Linux file is broken (left on those
        releases unless the user says otherwise). onnxruntime-node's `libonnxruntime.so.1` is the same case. macOS
        answered in 9.4 s (the first time it ever ran), Windows in 1.6 s.
FIXED (2026-10-19): sharp and onnxruntime-node unpacked (sharp's documented Electron setting), each installer
        with its own platform's runtime only; then the AppImage opened as a Linux user does on Ubuntu 24.04 (a new
        release job) showed two more faults — no libfuse.so.2 ("AppImages require FUSE to run"), and Chromium's sandbox
        blocked by AppArmor — fixed by the static AppImage runtime (toolsets.appimage 1.0.3); the sandbox is electron-builder's
        AppImage launcher's to drop (it adds --no-sandbox when user namespaces are blocked — a kit switch first added for
        it was removed, dry run 39350710161 green without it). The release now publishes only after every runner's start check
        and the Ubuntu 24.04 check pass. Dry runs 39350710161, 39352939681, 39354783277 (no kit switch): all five jobs pass (Windows 3.6 s, macOS 8.1 s, Linux 3.5 s,
        the AppImage on 24.04 2.8 s; the part finder's runtime loads on all).
REVIEWS (2026-10-19, independent agents, each finding checked and settled): the first — margin 0 dropped onHouse; a
        Texture step re-did the calming (~0.6 s); soft edges uncalmed; docs claiming more than the code; the note's
        unnamed programs; the first build's fingerprints — all fixed; a wing's walls vs its doors and a split house
        settled by the data (the main instance holds wings; every other instance is a neighbor). The second — the
        delete's later retry could undo a restore (now checks the house is gone); the start-up sweep would take every
        house's photos with a lost database (now only folders a held removal marked); a held folder stalled the
        server ~5 s (async now); the kit's AppImage sandbox switch duplicated electron-builder's launcher (removed);
        .deb missing from the kept files, publish on a moving image (fixed). Its other angles found nothing.
        The third (the help against the app; a user's first hour): the help named old wait/queue behaviour, GPUs, times
        and trim lists, and What's new missed the Linux, delete and can't-run changes (all corrected); Reset and the kit's
        restore had no retries, a photo half-added left a folder (fixed; marked `.adding`); a failed task lost its title
        (each job names what failed; the kit shows a server's own title); the parts list vanished with the finder
        removed, a search that found nothing looked untried, first-start Colors/Schemes said "add a brand" while loading
        and picked none as one landed, a taken design name was a "Conflict" toast, a deleted house's page read "no house
        <uuid>", a second Find could start, an empty part showed 1%, the schemes' "give the body a color" when it had
        another brand's, the AI photo's disabled button gave no reason, its install didn't make the photo, "Install ()"
        where no engine exists, an iPhone HEIC read as "not an image" — all fixed, with tests.
        The fourth (the newest commits' reactivity, edges, wording): a Reset left the access tokens out while the
        houses' files went (an async wait — the tokens and the seed now come back first, the folder is moved aside at
        once); a photo's missing file read as "the house was deleted"; HTTP's own 5xx phrases became titles (the kit
        keeps its words for those); the picker silently dropped other images; the `.adding` mark's two edges; generic
        HEIF brands taken for HEIC; the install card's size words where nothing installs; the photo started after an
        install while the card was busy; the tooltip naming the wrong reason; two screens missing from the help — all
        fixed, with tests.
        The fifth (the claims against the code; a light house photographed dark): darkness judged against the photo's
        bright end; every removal with retries; tests for what had none; the claims corrected (707bc9c).
        The sixth (two things at once): a restore stopped between its renames would lose the restored photos at the
        next start; the kit's restore could leave the folder missing; a reset during a photo add; the finder's model let
        go mid-run; an engine used while being removed; a re-found outline removed; the bright end moved by lamps (p95);
        the calming compared two scales once a paint now was set (now that paint is the finish); the window line said
        "loaded" for an error page — all fixed, with tests (RESEARCH §13).
        The seventh (2026-10-19, three agents — the upgrade from 0.1.2, the headless server in a browser, regressions
        since 0.1.2 — and my own pass on the untouched neighbors): a restore replaced the access tokens (family-wide:
        the template too, the guard checks it, advisory for JustWrite and docgen) and skipped the settings seed; houses
        restored before their first parts or AI photo had no folder for them; outline saves raced a delete or reset; a
        deleted house read "no house <uuid>"; a Reset after a held restore could bring old photos back; v0.1.2's
        half-deleted folders stayed; a kept Trim left the casings in no part; each stroke on a calmed part took ~0.6 s;
        Copy failed on plain http (Quasar's copyToClipboard, kit included, a guard rule); the help's claims about
        another device, a second copy and the headless command (a macOS/Linux launcher, started on every release
        runner) — all fixed, with tests (RESEARCH §13). Settled: the headless note counting a browser; the finder's
        release. Left: a 0.1.3 backup restored into 0.1.2 (0.1.2 can't change).
        The eighth (2026-10-19; security, accessibility, the seventh's fixes). Security — FIXED in the kit and the
        template, with tests (RESEARCH §13; the kit's §2): CORS only for the app's own origins, the Host guard
        against DNS rebinding (<APP>_ALLOWED_HOSTS for a proxy), proxied requests never loopback, a restore keeps
        the engine tables, backups without tokens, zip sizes checked. The seventh's fixes' findings — FIXED, with
        tests. Accessibility — all FIXED, the follow-ups below too (the window's minimum 960 × 700 — half a 1920
        screen, my call over the agent's 1180 — RESEARCH §13; the template's tokens the same). The twelve: a kit
        :focus-visible ring (box-shadow: QBtn's .no-outline beats any outline) with --focus-ring ≥6:1; aria-pressed /
        aria-current; the photo a Tab stop, arrows pan when zoomed (drawing stays pointer-only, the help says so);
        the paint grid one Tab stop (roving tabindex); AI photo rows named apart; the AI photo's reason as visible
        text; Ctrl+Z/Y not under a dialog, yes from a read-only input; contrast --muted 5.1:1 (4.56 on the selected
        tint), --success-ink 6.3:1, --warn-ink 8.8:1; two-tone outlines and tool marks; the side panel
        clamp(300px, 40%, 380px) and wrapping rows; aria-disabled keeps focus while a job runs; swatches named,
        24 px, house names titled. Found next by it: at 800×600 the photo starts below the fold (the page scrolls
        228 px); the kit's UiSlider sets its minimum when focus leaves its number box (Texture went 1 → 0 by Tab);
        Quasar item captions 3.6:1 light; the kit's non-default ink palettes keep muted text under 4.5:1; the
        nearest-paint ΔE tag by color alone; buttons nested in clickable rows; the kit contract's --muted #888.
        The findings as reported (an agent's, its probes reproduced 1–3): any web page can read the desktop server's data, keys and tokens (CORS `*` and
        loopback skipping auth); DNS rebinding passes the CSRF check (Origin compared to an unchecked Host) — writes,
        and an engine-config binary URL with no hash runs at the next install; a malicious backup restores
        runner_binary/runner_setting rows (code at the next engine install); a reverse proxy on the machine makes
        every request loopback; backups carry API keys and tokens in plain text; a restore's zip inflates with no
        cap. Clean: zip-slip, triggers/views in a backup, path inputs, static UI, uploads, pinned downloads, logs, XSS.
        Accessibility (an agent's, from the code): no visible focus on the app's own rows and chips (Quasar's
        outline:0, the kit's --focus-ring undefined → ~1.2:1); the selected part/design/paint not announced
        (aria-pressed/current missing, color-only borders); the photo canvas mouse-only (zoom can't pan by keyboard);
        120 paint chips each a tab stop; every AI photo row named the same; hints only in titles (a disabled
        button's, the ΔE badge's); Ctrl+Z/Y fires under open dialogs and not in a focused dropdown; light theme
        --muted 3.4:1, green ΔE badge 4.2:1, the AI tag 2.4:1; outlines/brush/box/split can vanish on a white house;
        the house page at the 800 px minimum (the photo ~160 px, the tools spill); focus lost to the body while
        jobs disable their buttons; small: shade swatches' color only in titles, an 18 px target, cut house names.
        The seventh's fixes, attacked (an agent's): Keep's reassignment gives the body pixels off the house (the text
        parts are clipped only to the house plus its margin — sky, a neighbor's roof at margin 0); the Linux help
        command's glob never matches the file (lower-case name); the Windows command fails in PowerShell (needs .\)
        and the section never says to quit the desktop app first; a new app from the template gets a launcher that
        isn't executable (new-app.js writes 0644, git records 100644, the guard checks only that it exists); a
        put-back that fails at start, then any write making a new houses folder, lets the next start delete the
        only copy; the shell's did-fail-load counts a failed iframe. Clean: the sweep on live houses, saveMasks,
        using()/releaseGpu, keepAuth, afterTables, the gone-state handler, calmAgain, replaceAssetDir, the launcher.
        The ninth (2026-10-20; the help's claims, failure paths and real size). The help (an agent's, read-only,
        to verify): on Linux the extracted AppImage's server uses a new data/ beside it, not the desktop app's
        folder (no houses, no token — open on 0.0.0.0); behind an HTTPS proxy every save is a CSRF 403 (the scheme
        and Host the server sees aren't the browser's Origin); What's new calls the window narrower though its
        minimum grew (800 → 960); with "Require a token on this computer too" the desktop window gets 401s;
        suspected: on macOS the data folder could land inside the app (beside Contents/MacOS) and go with an
        update; small: the tray item is "Quit Just House Paint", Install shows its size, models carry "(QAT)";
        gaps: Windows' firewall prompt, finding the network address, where the app's folder is.
        The help's findings: all FIXED (the kit's data folder, token and proxy fixes; the words) — RESEARCH §13.
        Failure paths and size: all FIXED, measured again (RESEARCH §13) — Undo/Redo off during a part search too,
        a paint lookup racing a brand's removal kept out of the cache. As reported (an agent's, measured
        with the app's own modules at 2048×1536, 15 parts): each
        Texture slider step re-prepares every part — 2.2 s (2.7 with a calmed body) per step, arrays 69 → ~280 MB;
        Save image paints the full original on the main thread (12 MP: 2.3 s, 268 MB; 0.5 texture + dark body 11 s,
        1.06 GB; 48 MP 47 s, 4.2 GB; a 192 MP photo is accepted); the AI photo composes at the original's size in the
        server (10 surfaces: 12 MP 1.7 GB, 48 MP 6.1 GB peak); a backup is held whole in memory (server 1×, renderer
        ~2×, main ~2× — 30 houses with AI photos ≈ 0.9–1.7 GB); the paint cache keeps a removed or reloaded brand's
        colors (the house still paints them; the AI photo drops them silently); outlines are written in place (a full
        disk truncates one; an unreadable outline then fails every Box, Keep and the AI photo); a transparent PNG
        shows black on screen but its hidden colors in the AI photo; a photo past sharp's pixel limit reads "not an
        image"; a window that reloads during Find the parts never re-attaches to the job (its old outlines then
        overwrite the new); small: a backup saved onto a full disk leaves a partial file, a killed AI photo leaves
        temp files and maybe a half PNG, Cancel waits out the finder's hash check. Clean: downloads resume, no
        network at first start, SQLite busy, jobs after a restart, memory over house switches, SAM encodings.
        The tenth (2026-10-20; the checks themselves, the kit's changes in the other apps, the screens). The checks
        (an agent's, mutations in a scratch copy — each survived all 385 server tests; all FIXED — app dcf917e, kit 0728a8f, each mutant now fails): the restore
        test's "backup with a token" was already scrubbed (dropping afterCopy's delete survives); scrubBackup's wiring
        untested; the finder's Cancel test throws before any hash (isValid not passing cancelCheck survives); the
        outline save test passes with the old write-in-place; the start-up AI-photo sweep in serve.js is never run
        (r.id for r.file would delete every AI photo); the guard's rules pass on comments and variants (CORS "*" in a
        list, a regex ".*"; afterCopy in a comment; clipboard via ?. or an alias; the workflow steps in YAML
        comments, the windowed step deletable, continue-on-error unchecked; an untracked launcher); the --headless
        check passes a blank page and could serve a stale dist/spa from the checkout; "window loaded" when a page
        inside the layout fails; Windows never compares its data folders; saveFromUrl and the backup wiring
        untested; the backup's "never whole" pinned only by Content-Length.
        The screens (an agent's, 173 captures of the built app — FIXED by an agent, measured again on a rebuilt app at 960/1366/1920 light and dark (house cards on the family's tokens; the tooltip's pending timer cleared, tested; Parts' swatch and ΔE under the paint name, 210–290 px; one .swatch rule, "Remove the color"; the house page a grid below 1024 px, no page scroll at 960×700, the panel's tabs one row with arrows; the kit's tab strips one row with arrows, Logs' selects fit, AI rows 880 px, Quick Setup left; EmptyState fit-content; the schemes' rows say why — a gray base, chroma under achromaticChroma, is not a bug; the no-color swatch a red diagonal named "No color"; off toggles 5.1–6.3:1; Paint colors' Import/Remove in the row's menu; "Reset Just House Paint"; About's link the accent ink; the boot plate a house, light and dark; the focus ring skips contenteditable) — at 960×700, 1366×768, 1920×1032, light and dark, faked
        parts and paints): Your houses' cards white in dark (names unreadable — a raw q-card); the Help button's
        tooltip stuck on screen after Help closes, one more per close (the kit's tooltip.js show() leaves a pending
        timer); the Parts tab squeezes the paint name to ~45–110 px (the side section ~190 px); the Colors tab's "On
        this wall" and "on it now" swatches 0×0 (.swatch scoped to PartsTab); at 960×700 the house page scrolls
        12–55 px beside its panel's scroller and the panel's tabs wrap; Settings' section strip wraps at 960; kit
        panels stretched (Logs' selects 846 px, AI Settings' cards ~1650 px, Quick Setup centred); the empty state's
        box ~1655 px wide; the Schemes tab's harmony rows empty with Apply off and no reason (synthetic palette —
        unverified); an uncolored part's empty swatch reads as a checkbox; dark-theme off toggles nearly
        invisible; small: Paint colors' rows wrap at 960, "Reset just house paint" in lowercase, About's link in
        browser blue, the boot plate still the template's notes icon and light-only. Right: dialogs, Help, the
        connection page, most Settings cards, title bar, nav, the house page at 1366/1920, focus rings.
        The kit's changes in the other apps (an agent's, from the code — all FIXED in the kit, 0728a8f: the token page only for an app that asks, the restore keeps this computer's runner rows only, bundled only when packaged with AppRun, work folders beside the database, the save's held-rename retry; the editor ring with the screens' fixes; JustVoice's host and JustWrite's ring sent to their sessions): the health answer's
        tokenRequired stops JustVoice's, JustWrite's and docgen's windows at the token page, which they can't pass
        (JustVoice keeps its token under jt:token; the others' Settings keep none) — their escape (Settings →
        Server, open from this computer) gone; the restore's kept runner_setting holds the user's default preset,
        model-list rules and update policy, not only this computer's (a moved backup loses them, or points the
        default at a preset that's gone); JustWrite's TipTap editor (tabindex 0, contenteditable) gets the focus ring
        around the whole writing area on a click; smaller: a dev checkout run from an AppImage-hosted terminal
        (APPIMAGE set) would move its data/ out; backups and restores unpack on the system drive's temp; the shell's
        .part rename has no retry for a held file; Docker's host.docker.internal calling JustVoice's /mcp is refused
        (no allowedHosts wired there).
        The eleventh (2026-10-20; started): a 0.1.2 user updating (the database, a 0.1.2 backup, the data folder's
        place on each platform, the updater's feed, the first start after) and several clients on one server at once
        (lost updates, deletes under a running job, a restore while another client saves) — two agents, read-only.
        Several clients (an agent's, two windows by fetch on the real server and on createApp with a fake finder;
        all FIXED as decided below — kit 062d3ab, the app's server and page with tests; RESEARCH §13): nothing checks versions and an open page never reads again (HousePage load() only). Saving a
        design sends the whole colors map and the server rewrites it — A's body lost to B's trim save; "paint it has
        now" the same; a stroke, Undo or Redo PUTs the page's whole stale outline — another window's Box undone,
        60000 px in two parts at once; a Find started elsewhere is unseen (the brush stays on, the stroke made during
        it gone, the next stroke writes the pre-find outline over the found one); Box reads every outline then saves
        while a fresh PUT lands between (3 of 12 rounds lost, 200 answered); a restore has no write gate (a save
        during it answered 200 and vanished; the stale window's next save lands over the restored data) and jobs are
        cancelled only after; a restore with a held file answers 500 after the tables committed (houses/ half old, a
        houses.restoring-* left) or, held share-all, prunes a house added meanwhile; a backup while another window
        deletes a house — 500 ENOENT, or a zip whose database lists a house with no files; a brand reloaded or
        removed in one window keeps its old colors in the others (their AI photo "Pick colors first", or parts
        silently missing); AI color schemes on the local model killed by another window's AI photo (from code); a
        design deleted elsewhere — a raw "Not Found — no design <uuid>" toast; small: a second Find joining the
        first ignores its keep-hand-edits choice; prefs follow the last device (by design, §14). Right: delete
        during a stroke or a job, reset during a stroke or upload, the GPU one job at a time and re-attach, the
        single-step writes, the General form's changed-keys-only save, engine remove vs Box; no crash.
        The 0.1.2 user updating (an agent's, a real 0.1.2 server on a temp folder with houses, parts, designs, a
        brand, a token and backups, then main on the same folder; all FIXED as decided below — What's new's first
        two points, the shell's clamp, the draft release): Mac users of 0.1.2 lose their houses on update —
        0.1.2 kept data in Just House Paint.app/Contents/MacOS/data, a Mac update replaces the .app by hand first, and
        0.1.3's adopt looks only inside the new app (from code; What's new says the data "stays outside the app");
        a proxy or another name for this computer now gets 403 host-not-allowed (What's new says only "safer");
        the 960 × 700 minimum is taller than a 1280 × 720 usable screen (150 % on 1080p) — the window hangs under the
        taskbar (measured); the release is "Latest" before its latest*.yml is attached (an update check then errors).
        Right: no migration since 0.1.2, every row kept, the new settings added, changed values and the token kept;
        the start-up tidy keeps all of a 0.1.2 folder; a 0.1.2 backup restores (own token kept, runner rows
        unchanged); Windows' data folder and installer.nsh unchanged; the updater's file names, appId and feeds; the
        engines found again without download; the AI offer and prefs kept; Linux's folder the same.
        The eleventh's fixes — decided (mine, argued, under the finish-everything go; each names its standard):
        · Other windows' changes: the kit's watchSync (its GET /v1/sync/rev contract — family code, JustWrite and
          JustVoice use it) on a server counter of the changes OTHER windows made: each window sends an id
          (X-Client-Id, the kit's serverApi, opt-in), the server counts writes by anyone else; the open page
          re-reads in place (house, parts, outlines, designs, jobs; brands' paints forgotten when they changed),
          never under a stroke or save in flight. (Attack: a counter that moves on the window's own saves would
          re-read after every stroke — hence per window; a whole-window reload would lose zoom and undo each time
          the other person paints — hence in place.)
        · Colors: a design's colors and the paint each part has now saved as JSON Merge Patch (RFC 7396 — only the
          parts changed; null removes), so two windows painting different parts both keep theirs.
        · Outlines: an ETag per house's outlines (RFC 9110 conditional requests — If-Match, 412): a stroke, Undo,
          Redo and Find the parts carry the version they were made on; a stale one is refused, the page re-reads
          the outlines and says so. The version lives in the server's memory (opaque, a new series at each start
          and restore — no migration, so a 0.1.3 backup still restores into 0.1.2 where it did). Box, a stroke's
          save, a part added and the find's commit run one at a time per house (the kit's Mutex).
        · Restore and reset: the kit's maintenance gate — writes answered 503 with Retry-After (RFC 9110 §15.6.4)
          while one runs, the writes in flight finished first, the jobs cancelled before anything is replaced;
          the folders swapped first and all-or-nothing (a file held past the retries refuses the restore with
          nothing changed — no copy-over half state), then the tables, the folders put back if the tables fail.
        · Backup: a point-in-time copy — the database (VACUUM INTO) and hard links to every file made in one
          synchronous step (nothing else runs between them), zipped after; where links can't be made (FAT/exFAT),
          the live folders with a vanished file skipped.
        · Small: a design deleted elsewhere gets words and the list re-read; the AI photo names the parts whose
          paint is gone (422) instead of dropping them; the AI photo waits for AI color schemes on the local model
          (gpu-busy); a second Find with another keep-hand-edits choice is refused, not silently joined; prefs
          following the last device stay (the family's §14).
        · The 0.1.2 update: What's new (the release notes) tells Mac users of 0.1.2 to back up or move
          Contents/MacOS/data before replacing the app, and proxy / other-name users to set ALLOWED_HOSTS; the
          window's minimum is clamped to the screen's work area (Electron's screen API); the release is created as
          a draft, its files attached, then published (gh release create --draft … edit --draft=false).
        The twelfth (2026-10-20; started): today's fixes attacked (races, the restore's crash points, the snapshot,
        regressions, the docs' words) and the app left open for hours or days (polls, timers, growth, a sleeping
        laptop, a server restarted under a window) — two agents, read-only. Dry run 39385554498 (app 8c30158, kit
        062d3ab): macOS green; Windows and Linux failed in the data-folder comparison now run on every runner —
        Git Bash on Windows has no /dev/stderr for tee, and the unpacked Linux build was refused for a data folder
        beside its executable (by design; the rule is for a bundle only) — FIXED (app d30fe19, the template too);
        dry run 39386374890 all green (Windows, macOS, Linux, the AppImage as a user opens it): the window and the
        server on its own share one folder on each — macOS ~/Library/Application Support/JustHousePaint, Windows and
        the unpacked Linux build data/ beside the executable.
        Today's fixes attacked (an agent's, with scratch tests; all FIXED as decided below — kit 54b1e8b, the app's
        server and page with tests): a design saved after another window's
        change sends that window's parts back with their old values (the patch's base is the refreshed design, the
        screen's colors the old draft — B's trim lost); a stroke drawn on old outlines can be saved with the new
        version (the gap before reloadOutlines raises its busy flag, onStroke's await before scheduleSave, Undo/Redo
        not blocked during a re-read, a version adopted though a mask failed to load); the restoring window reloads
        itself mid-restore (teardown — beforeReplace — moves the epoch and the outline series before the swap): its
        refusal never shows, and a refused restore still reloads every window, cancels their work and 412s their
        next stroke; a failed interrupted-restore recovery (renameSync, no retries) then the app's start-up sweep
        delete the user's own houses (it removes houses.replaced-*, or puts back the backup's .restoring- copy); a
        failed undo at runtime leaves the backup's folders under the old tables with the gate open, and the next
        restore deletes the copy the journal names; JustVoice (from code) got the swap-first restore without its gate
        — its own open audio handles make every restore refuse; small/wrong: jobs signalled, not awaited, before the
        swap; a drain timeout proceeds with a write running; the epoch compared only when rev moves (a server restart
        that lands on the same count is never seen); the commit point is the journal's removal, not the DB COMMIT;
        the backup DB checked only after the swap; rename(from, dir) not retried; a change during load() dropped;
        strokes while busy dropped silently; a Box answered during a re-read can move the version back; a queued
        save after another house opens has no If-Match; If-Match's W/ accepted (needs strong comparison); linkTree
        ~0.33 ms a file on the event loop (10 000 files 3.3 s); the one-row tab strip and fit-content EmptyState in
        the other apps not checked (JustWrite's modals: the empty box sits left). Docs: "other windows wait" — they
        are refused; "nothing changed" isn't true on those paths; "keep both" false until the above; the 412 also
        follows a server restart or a refused restore; the Mac note reads as "move into" (rename data to
        JustHousePaint; Library via Go → Go to Folder). Right: the gate (503, shutdown exempt, refused writes not
        counted), the journal's crash points inside the swap, the snapshot for this app's writers, no caller left on
        PUT current-paints, the docs' refusal words and setting name, the draft release.
        Left open for hours or days (an agent's, the headless server on a temp folder driven by fetch, real Edge and
        Playwright; all FIXED as decided below, two kept with their reasons): after any server restart the first stroke, Box or Find is refused "changed in
        another window" (the outline versions are a new random series each start; one window's rev reads 0 before
        and after) and the Undo history goes; a plain restart is taken for a restore — every window reloads
        (unsaved colors on screen lost), or keeps the old epoch and reloads at the next ordinary change, or misses
        changes (the count restarts at 0); a job's poll gives up at the first failed request (a tablet asleep during
        Find, a Wi-Fi drop, a restart — then a raw "no job <uuid>"), and the window never learns the result (the
        job's end counts as its own change); no Page Visibility anywhere — a hidden or minimized window polls 15 a
        minute (21,600 a day), a hidden house page re-reads and repaints for every other window's change; every
        write counts as a change (prefs, a harmony calculation, client logs, AI runs, other houses) — 6 GETs and a
        300 ms repaint each; keep-running hides the window, the page and its arrays alive for days; the
        connection page probes every 2 s forever; a removed token leaves the tab alive on 403s; the AI tasks panel
        ticks at 500 ms hidden; the update check runs only at start; work folders and .saving files swept only at
        the next start or operation; the outline and window-id maps never shrink; llm_usage never pruned. Right:
        an idle server costs nothing, logs bounded (500 lines, 30 days), 1,200 strokes and 150 houses add/delete
        level off, no WAL growth, the finder and the local model let go when idle, the renderer frees its URLs,
        bitmaps, worker and listeners, Undo keeps 50, waking makes one request.
        The twelfth's fixes — decided (mine, argued, under the finish-everything go; each names its standard):
        · Designs: a three-way merge — the draft keeps the design's colors it started from; a save sends what
          changed since; another window's change moves the parts left as they were (git's merge, RFC 7396 diffs).
        · Outlines: the version is the database's — a hash of the house's parts rows (key, updated_at, area) and
          when its parts were found (RFC 9110 §8.8.3: a validator stays while the representation does) — so a
          restart changes nothing; a stroke's save carries the generation of the outlines it was drawn on and is
          dropped if they were read again since; Undo and Redo wait for a re-read; a version is taken only with
          every outline; an answer's version only if none was taken meanwhile; If-Match compares strongly.
        · Two signals: a process boot id in `rev` (a restart: the page reads again in place) and a data epoch kept in
          the database, renewed only by a restore or a reset that succeeded (the window reloads); only data writes
          count (an allow-list of the app's data routes); the house page repaints only when what it read changed.
        · Restore: the jobs stopped and waited for (bounded) before anything moves; the series renewed only after
          success; the backup's database checked (quick_check, the app's hook in a dry run) before the gate closes;
          a write still running past the drain refuses the restore; the commit record inside the restored tables
          (the record outside them rolls forward or back on it); the start-up recovery retries a held rename and,
          failing, shuts writes until a restart; nothing restores, resets or sweeps while a record names folders; a
          failed undo shuts writes until a restart; apps without the gate keep the restore before it (JustVoice's
          own open audio would make the swap refuse).
        · Long sessions: the kit's watchSync, the connection page (2 → 60 s backoff) and the AI tasks ticker pause
          while the page is hidden (the Page Visibility API) and check at once when it shows or the network is back;
          a job's poll retries a network or 5xx failure with backoff, and a job gone (a restart) re-reads the house;
          a 401/403 from the token check sends the window to the token page; the update check also every 6 hours
          and on wake (powerMonitor resume — electron-updater's pattern); the kit's work folders swept at start and
          daily, stray .saving files at start; the per-house lock dropped when idle, window ids by age.
        · Kept, argued: keep-running hides the window (Electron's tray pattern — destroying it would lose the open
          page and its unsaved colors; hidden, it no longer polls); llm_usage keeps a row per AI call the user makes
          (tiny, the AI usage page reads it).
        The thirteenth (2026-10-20; started): the twelfth's fixes attacked (the database version's collisions, the
        epoch row, the commit record, the three-way rebase, the generation logic, the legacy restore for the other
        apps, the docs' words) and an unusual user's computer (odd and long paths, OneDrive, FAT/exFAT, network
        drives, a non-English locale, no NVIDIA card, high DPI, touch, antivirus, a proxy) — two agents, read-only.
        Dry run 39390758821 (app 290c777, kit 54b1e8b) all green on every runner and the AppImage as a user opens it.
        The twelfth's fixes attacked (an agent's, scratch scripts on Electron's Node; all FIXED as decided below, two
        kept with their reasons): Add part changes the
        version (the parts rows) but the store neither sends If-Match nor takes the answer — this window's next stroke
        is refused "changed in another window", and a part added in another window resets this one's Undo; Undo to
        another design's draft then Save sends the wrong patch (setColors moves designId, not designBase) — the user's
        change dropped; a start-up roll-forward that can't remove the old folder shuts writes for the whole session
        (the data is fine); a job that finished while the window slept and was then forgotten (10 min) reads as "the
        server started again"; the gate drains every non-GET — a slow AI-schemes run or brand load blocks writes 60 s
        then refuses the restore; the epoch has gaps (the backup's dataEpoch row served between the copy and
        onReplaced; a reset's GET writes a temporary one); designs read just before a save can revert it on screen; a
        stroke can start in the refresh's first await; small: words while shut until restart ("try again when it's
        done"), the on-wake update check runs before Wi-Fi and its error replaces "available" for 6 h, releaseGpu
        unbounded in teardown, the journal written in place (two-folder apps), 5xx retried forever, a dialog-held
        window's save lands in restored data, a crashed first restore's copy put back under empty tables; left open:
        a stroke while busy dropped silently, linkTree's blocking, EmptyState in the other apps not rendered. Docs:
        "needs a restart" in a case where the data is fine; "your data is as it was" not until a restart in the
        unfinished case; "a hidden window asks nothing" false while a job runs; "every window shows the new data"
        false after a refused restore; no entry for "A change is still being saved"; Add part changes outlines too.
        Right: the hash's collisions need the same millisecond and area; the lock cleanup; answered() and per-house
        versions; DATA_WRITES complete; restart vs restore; the commit record's crash points; the start-up order; the
        other apps on the legacy restore; visibility, the token notice, the Mac steps.
        Their fixes — decided (mine, argued): Add part sends If-Match and takes the answer (as a stroke and a Box); a
        part added elsewhere still re-reads the outlines here (an empty part left out of the version would let a part
        erased to nothing be overwritten unseen); each history record carries its design base, Undo/Redo restore it;
        the roll-forward's removal best effort; a finished job's tombstone kept for the process's life — 410 Gone (RFC
        9110 §15.5.11) — the window re-reads quietly, only a real restart says "stopped"; the gate drains and refuses
        only the app's data writes (the same list the change counter counts); the epoch renewed inside the restore's
        transaction (afterCopy) and right after a reset's seed, written once at start, never by a GET; a designs
        answer older than the design held is ignored (updatedAt); the refresh raises its busy flag before its first
        await, and a stroke refused while the outlines are read says so once; the gate's words when shut until a
        restart; a background update check that fails leaves the panel as it was, and the on-wake one waits 30 s;
        releaseGpu bounded in the teardown; the journal written beside and renamed in; a 5xx retried ten times; a
        restore's copy rolled back where there was no folder before is removed, and the sweep never puts a staged
        (.restoring-) copy back. Kept, argued: a window holding a dialog through another window's restore saves into
        the restored data (its save is the user's own new change; a deleted house or design is refused by its own
        404); linkTree's ~0.33 ms a file (a house ~30 files — 100 houses ≈ 1 s, once per backup).
        An unusual user's computer (an agent's, measured on this machine — LongPathsEnabled on, Defender off, the VC++
        runtime installed, all NTFS, which hide some of these; being fixed): Change folder always fails on Windows (the
        picker returns an existing folder; renaming the staged copy onto it is EPERM; the copy freezes the window); a
        FAT32 data folder crashes the server ~15 s in (proper-lockfile's mtime check, its default onCompromised
        throws; a network share waking does the same); a chosen data folder missing or unwritable gives the shell's
        "JavaScript error" dialog or a raw stack, the connection page no reason, no way back to the default; the
        finder and the AI photo need the Visual C++ 2015–2022 runtime, unshipped and unnamed ("module could not be
        found", "exit 3221225781"); the macOS AI photo engine needs macOS 26 (minos 26.0) and the Linux one glibc 2.38
        (Ubuntu 22.04 can't) — found after the 9 GB download, the status says available; a second Windows account's
        app shuts down the first's server (the shutdown route trusts any local process) and the first's window then
        uses the second's data; behind TLS inspection every download fails (Node's own CA list —
        NODE_USE_SYSTEM_CA), brand lists ignore HTTPS_PROXY, no system proxy, "fetch failed" loses its cause; long
        paths: native code isn't longPathAware (the AI photo past ~190 characters, the finder ~220, the server ~245);
        antivirus: a quarantined sd-cli reads installed (a marker file), a quarantined DLL "exit 3221225781", a
        quarantined onnxruntime.dll loads Windows' own 1.17 and the server dies mid-Find, renames after a write or
        unpack have no retry; Smart App Control blocks the unsigned files with no help entry; no slow warning for an
        integrated GPU's Vulkan build, no RAM/VRAM check before the 9 GB download, DirectML on adapter 0 (often the
        integrated GPU), the help and Settings promise the graphics card on macOS and Linux where the finder is CPU;
        saved file names use the house name raw ("10/20" a folder, ":" invalid); a decimal comma reads 0,05 as 5 and
        the sliders' boxes ignore it; OneDrive or network data folders unwarned; an HDD adds ~90 s per AI photo (the
        help says 20 s–1 min); a move to a higher-DPI monitor leaves the photo blurry; touch: no touchcancel (a palm
        leaves the brush on), two fingers paint; small: search ignores accents, 80-character cuts split emoji,
        right-to-left names unisolated, the log download's UTC date, a folder ending in "." (Node "data.", SQLite
        "data"), a Hyper-V reserved port says nothing, no free-space check before the 3.3 / 9.6 GB installs. Right:
        non-ASCII folders and install paths end to end (native libraries too), a UNC folder (hard links over SMB), 197
        characters, odd photo names stored safely, the backup's link fallback and ZIP64, local-midnight logs,
        SmartScreen in the help, model downloads honour HTTPS_PROXY, no firewall prompt.
        Their fixes — decided (mine, argued; each names its standard): Change folder moves into the picked folder when
        it is empty (refused in words when not), copies with the async fs.promises.cp, removes its staging copy on
        failure; the data-folder lock passes proper-lockfile's documented onCompromised (logged, the lock taken again)
        — never a crash; a data folder that can't be used is said at start (the shell's dialog: Try again / Use the
        default folder; the headless server one line, not a stack) and its first error reaches the connection page;
        the health answer names its owner (a hash of the OS user): the shell never stops another user's server;
        the server runs with NODE_USE_SYSTEM_CA (Node's documented switch), the shell hands it the system proxy
        (session.resolveProxy → HTTPS_PROXY), brand lists go through the kit's fetch, a failed fetch keeps its
        cause; a data folder past 180 characters or ending in "." or " " is refused in words; the engines say what
        they need before downloading — the VC++ runtime (detected; Microsoft's own download named, not shipped: its
        licence is Visual Studio's), macOS 26, glibc 2.38 — and turn 0xC0000135 / 0xC0000139 / a missing exe into
        words; the installed check checks the engine's files, the finder's runtime check its ONNX Runtime version;
        renames after a write or unpack retry a held file (the kit's renameHeld); free space checked before an
        install; the slow note for every non-CUDA build; RAM checked before the AI photo's download; DirectML takes the
        adapter with the most memory; the help and Settings say the finder's graphics card is Windows'; saved file
        names made safe (the kit's safeTitle rules); a decimal comma accepted where it can only be one; the canvas
        follows the screen's pixel ratio (matchMedia); Pointer Events with pointercancel, one pointer at a time; search
        folds accents (NFD); cuts by grapheme (Intl.Segmenter); names isolated (<bdi>); the log's local date; a
        reserved port said; help entries for Smart App Control, OneDrive and network folders, a slow disk, the
        minimum systems. Kept, argued: HF_ENDPOINT mirrors (no user asked; the downloads honour a proxy); the Linux
        keyring prompt (unverified, no secrets kept there); Windows on ARM's AI photo on the CPU (said in the help).
        The renderer's part — DONE by an agent, each with a test that fails on the old code (unit 158; kit ui 41):
        saved file names through the kit's safeTitle (a name with nothing left is "House"); a decimal comma accepted
        where it can only be one (a comma shaped like a thousands group stays one where the field groups); the
        canvas follows the screen's pixel ratio (matchMedia resolution, each layer's setPixelRatio); Konva's pointer
        events with pointer capture, one pointer at a time, a cancelled pointer drops its stroke (touch-action: none);
        paint search folds accents and case (a deterministic fold() SQL function in the store — 34 ms on 20k rows);
        names cut by grapheme (Intl.Segmenter) on the server and the color card; names inside sentences isolated
        (FSI/PDI, <bdi>); the log download named by the local date. Left by it: isolate.js belongs in the kit; the AI
        schemes cut their names by UTF-16 units (schemes_ai.js); the kit's SyncPanel names a backup by the UTC date. (All three
        done by me: isolate and localDate in the kit; the schemes cut by grapheme — server/src/shared/text.js.)
        The kit's shell and data folder — DONE by an agent (24 tests fail on the old code; kit core 1299; a live smoke
        on a scratch Electron app): Change folder copies into the picked empty folder with fs.promises.cp (a
        non-empty one refused; a failure removes what it copied); the lock's onCompromised logs and takes it again
        (never throws); a data folder that can't be used: the shell's message box (Try again / Use the default
        folder / Quit), the headless start one line and exit 3, the reason to the connection page
        (serverStatus.serverError); the health answer's owner (a hash of the OS user) — the shell stops only its own
        user's server; NODE_USE_SYSTEM_CA and the system proxy for the server (launchers too); the 180-character /
        trailing-dot rule; a reserved port said (serverStatus.portReserved). Its additions, accepted (each the
        decisions' consequence): the window's requests to another user's server blocked until its own listens (else
        it loaded their data); NO_PROXY for loopback (undici proxied the local AI model's calls); .DS_Store,
        Thumbs.db and desktop.ini don't make a folder non-empty; the path rule on every system. Left by it: the
        connection page's words for portOtherUser, portReserved and serverError; Electron's "Error invoking remote
        method" prefix on Change folder's refusals; two app tests comparing the health answer whole; the other
        apps' launchers. (Done by me: the connection page's words in the app and the template, the preload strips
        Electron's prefix for every app, both health tests; the other apps' launchers sent to their sessions.)
        The app's engines — DONE by an agent (24 app tests fail on the old code; server 429, unit 161; kit core
        1299): each engine build lists what it needs (Windows: the VC++ DLLs, looked for where Windows' loader looks;
        macOS 26; glibc 2.38) and Install refuses before anything downloads (409 runtime-missing / cant-run-here,
        Microsoft's download named); 0xC0000135 / 0xC0000139 / 0xC0000106 and a missing exe in words (503 "The AI
        photo's engine couldn't start"); the engine's marker lists every unpacked file, a gone one unpacks again; the
        finder refuses an onnxruntime.dll loaded from elsewhere (Windows' own); the kit's renameHeld (rename_held.js)
        for every rename after a write or unpack; free space checked (507 disk-full, the unpacked sizes measured from
        the zips' central directories, a 256 MB margin); the slow note for every non-CUDA build; a RAM note (12 GB
        with a card's own memory, 16 GB otherwise — a warning); DirectML on the DXGI adapter with the most dedicated
        memory; brand lists through the kit's fetch (proxy) with the failure's cause kept; "Use the graphics card
        (Windows)". Kept, argued: the RAM need and the 5× unpack allowance stay constants — what the engines need, not
        a choice a user makes (family rule 1 is for values a user might change).
        The thirteenth's fixes committed (app 487b364, kit 0cec745: server 430, unit 161, e2e 16; kit core 1299, ui 43;
        JustWrite 21 + 741, JustVoice 8 + 260, docgen 165 + 5). The fourteenth (2026-10-20; started): the thirteenth's
        three agents' code attacked — one agent, read-only. Dry run 39400636078 green on every runner and the AppImage.
        Its findings (an agent's, scratch scripts on the kit's own code; being fixed): two Change folder moves can run
        at once (the "Moving…" lock is the panel's; a picked folder's .moving marker is wiped as unfinished while its
        move still runs) — the old folder emptied, the new without app.db or houses; the tray's Start/Restart server
        reopens the old folder mid-copy (the copy is async now); after a lost lock the server keeps serving while
        another holds a fresh lock — two servers on one folder; "Use the default folder" deletes the pointer — the
        user's data stranded, unsaid, no way back (and the 180-character rule now refuses the other apps' working
        pointers); a Windows known folder (Documents, only desktop.ini) counts as empty and is deleted whole by the
        next start's cleanup after a later move; the other-user guard rests on one 500 ms probe (a busy server reads
        "port taken" and the window boots on the other user's data); NO_PROXY gets loopback only when the shell sets
        the proxy (a user's own HTTP_PROXY sends the local AI's calls to it); the free-space check counts a resumed
        download's .part at full size (507 on resume); number fields: "1,5" silently 15 in a whole-number field,
        "1,23" vs "1,234" a 100-fold difference by one deleted digit; the canvas paints with any button (right
        click, middle, a pen's barrel and eraser end) and a lost pointer capture leaves the stroke live; the other
        apps' connection pages and launchers untracked; a missing named folder on a present drive is made empty; the
        owner hash follows HOME; the docs promise a graphics-memory check the code doesn't make, mix GB units, and
        overstate the proxy; Change folder has no free-space check and drops timestamps (12 GB hashed again). Right:
        a single move start to finish, the preload's strip, an older server as "mine", fold() never in a schema
        object, cutToLength within ajv's maxLength, the brand feeds through the kit's fetch, ONNX Runtime and its
        binding from one folder, DXGI's offsets, the exit codes, the disk numbers, isolation never in a file name.
        Their fixes — decided (mine, argued): one move at a time in the shell (a flag; Change folder refused while
        one runs, the server not started, the tray's items off — Electron's MenuItem `enabled`), the marker holds the
        old folder's path and is ours only when it matches; Change folder moves into a new folder named for the app
        inside the one picked (the usual practice — the picked folder's own files never touched), refuses a
        non-empty one there, checks the room first and keeps timestamps; the next start's cleanup removes only what
        the move copied; a lost lock is taken again only when it is free or ours-stale (proper-lockfile's meaning of
        compromised) — another server holding it fresh ends this one by the folder-in-use path; "Use the default
        folder" is for this start only — the pointer kept, the dialog says where the data stays and that it asks
        again next start; the 180-character and trailing-dot rules for a folder being chosen, a working pointer only
        logged; a named folder that doesn't exist is said missing, never made; the window kept off its port
        whenever its own server failed to listen there, until it does; NO_PROXY gets loopback whenever any proxy is
        set; the owner is the OS user (and its Windows domain), not HOME; the free space counts what a .part already
        holds; a number field takes a group separator only where groups go (a whole-number field says "1,5" is
        wrong); the canvas draws with the primary button only, a pen's eraser end erases, a lost capture ends the
        stroke (W3C Pointer Events); the guard checks the launchers' NODE_USE_SYSTEM_CA and the connection page's new
        reasons (required where the release is, advisory for the others); the docs as the code says; the release's
        headless check prints the AI photo's status on each runner (glibc read inside the AppImage's server).
        Done: the shell's part by an agent (37 tests fail on the old code; kit core 1326; JustWrite 173, docgen 165,
        template 54, the app 431) — one move at a time, the app's own folder inside the one picked (room checked,
        times kept, only its own entries cleaned), a lock taken over by another server ends this one, "Use the
        default folder" for this start only, the path rule for a folder being chosen, a named folder never made, the
        window kept off its port on any listen failure, NO_PROXY loopback for any proxy, the owner the OS account; its
        two calls accepted (the old folder's own Chromium folder and lock cleaned too; the data-dir variable held to
        the path rule in the desktop app too — it is chosen at each start). Mine: a resumed install counts its
        partial downloads; number fields strict (a group separator only where groups go); the canvas draws with the
        primary button only, a pen's eraser end erases, a lost capture ends the stroke; the guard checks the
        launchers' NODE_USE_SYSTEM_CA and the connection page's reasons; the e2e drivers make the data folder they
        name; the Storage panel's words; the docs. JustVoice's csrf test (403 since the 2026-10-19 Host guard — its
        test host "testserver" not allowed) sent to its session. Caught by the e2e run before committing: every app's build failed — the shell's Change
        folder borrowed dirSize from disk_api.js, whose lazy imports of the AI runner split the Electron main into
        chunks Rolldown refuses with `output.file`; dirSize is its own module (platform/dir_size.js, disk_api
        re-exports it) and a kit test walks the shell's imports for any lazy one (fails on the faulty import).
        The fourteenth's fixes committed (app f4850c0, kit 609bbb9: server 431, unit 162, e2e 16; kit core 1327, ui
        43; JustWrite 173 + 741, JustVoice 260 + 8, docgen 165 + 5). The fifteenth (2026-10-20; started): the
        fourteenth's shell code attacked, and the screens and keyboard again after the tenth-to-fourteenth's interface
        changes — two agents, read-only. Dry run 39410206013 green on every runner; the engines' status read inside each
        packaged server (start-packaged): Ubuntu 22.04 — the AI photo not offered, "needs glibc 2.38, this one has 2.35";
        the AppImage on Ubuntu 24.04 — available (cpu), so the glibc read works there; Windows (no GPU) — available
        (cpu); macOS 26 (macos-latest is macos-26-arm64) — available (metal); the part finder's runtime loads on all.
        From JustVoice's session: the macOS launcher took the first file in Contents/MacOS (find | head -n 1) — an app
        with another program there started that one; FIXED in the template and here: the bundle's own executable by
        its Info.plist (CFBundleExecutable, PlistBuddy) — the next dry run's macOS runner checks it (--headless).
        The fourteenth's shell code attacked (an agent's, scratch scripts on Electron's Node against the kit's own code;
        being fixed): Change folder accepts the install folder (one "up" from the data in the picker) — the next update's
        uninstall keeps only data/ and dataroot.txt and deletes the rest, the user's data with it (measured with the
        installer's removal ported); the next start's cleanup deletes the copied names from the old folder whenever it
        runs, even after the app ran there again (a data-dir variable, "Use the default folder") — new work deleted
        (measured); a server start already waiting (the proxy lookup, the port probe) when the move begins forks on the
        old folder mid-copy (measured); fs.cp makes relative links absolute into the old folder (the HF snapshots, the
        engine's .so links on macOS/Linux — Node's verbatimSymlinks); the strict number reading refuses ".7", "5.",
        "15.", "+15", "1 500", ",5" and UiNumber then clears the box (SyncPanel turns the null into 0: "15." set
        auto-sync to manual only — JustWrite, JustVoice); a token kept in the window (require one on this computer too)
        is left behind by a move — locked out; preserveTimestamps keeps no NTFS millisecond mtime (0/20) and the
        engines compare exactly — 12 GB hashed again after every move; the pointer's write has no retry and a failure
        leaves the full copy and a raw EPERM; Quit mid-copy leaves a half copy for good; killed while emptying the old
        folder keeps it for good; a server stopped by a lost lock leaves the window uninformed until a reload;
        headless servers still send loopback through the user's own proxy (http.js, llm/base.js); partBytes credits
        sparse .part files (macOS/Linux) and leftovers; other apps sharing this app's model cache lose it after a move,
        unsaid; an old drive gone for good asks at every start with no way to stop, and the default folder can't be
        chosen again; FAT32: the lock lost every ~20 s, taken back 5–7 s later; small: USERDOMAIN can be missing, the
        guard's comment stripping is JS-only, docs ("removed at the next start", "--data-dir" must exist, the pen's
        eraser and the primary button unsaid, "under 180" vs ≤ 180), two stale comments, "copy failed: EFBIG" raw.
        Right: one move at a time, the cleanup's limits, the room check, inside-the-data refused, the lock's retake,
        guardPort, JustVoice's default, NO_PROXY's ::1, the canvas in real Chromium (CDP touch, mouse, pen), the bundle
        test.
        Their fixes — decided (mine, argued — Change folder's third round, so made simpler, not patched again): the old
        folder is never removed by the app on its own — a move copies, checks (fsync), writes the pointer (renameHeldSync)
        and switches; Settings → Storage then shows the old copy with its size and **Remove the old copy** (it removes
        only what the move copied, never the folder the app runs on) — no cleanup race, no "killed while emptying", no
        late deletion; a target inside the app's install folder or bundle is refused (Microsoft: user data never in the
        program folder) except the default folder itself, which Storage offers as **Move back to the default folder**;
        a start already under way is checked again right before it forks, and the move waits for it; links copied as
        they are (verbatimSymlinks); quitting while a move copies is held ("the data is being moved — quit when it's
        done"), and a half copy an earlier stop left is removed at the next start (its marker names the old folder, the
        pointer doesn't name the new); the window's token carried across the move (a one-time file in the new folder,
        read and removed at the relaunch); the engines compare a file's time with a 2-second tolerance (rsync's
        --modify-window — FAT's 2 s too); a server stopped by a lost lock reloads the window, which then shows the
        connection page's reason; loopback never through a proxy, headless too (undici EnvHttpProxyAgent noProxy in
        http.js and llm/base.js); partBytes counts a .part's allocated blocks (st.blocks × 512 off Windows) and only
        the files the install fetches; the move's confirm names the apps sharing its models (as Clear models does);
        Storage, while a start uses the default folder, offers **Use the default folder from now on** (the pointer
        forgotten); on a drive whose file times are coarse (FAT) the lock lives in the system's temp folder, keyed by the
        data folder's path; number fields read with @internationalized/number's NumberParser (React Spectrum's —
        partial input, the language's minus and grouping) and a refused text stays in the box with its rule's error,
        never cleared — SyncPanel never turns an empty value into 0; the guard strips # / rem / :: comments in launchers
        and wants NODE_USE_SYSTEM_CA=1; EFBIG said in words (a FAT32 drive's 4 GB limit); the docs and comments as the
        code is. Kept, argued: the owner from USERDOMAIN and the user name (a service runs as another account anyway;
        the SID needs a process per check).
        The screens and keyboard again (an agent's, the built app on fake data in a temp folder, 960×700, 1366×768,
        1920×1032, light and dark, 223 screenshots with a probe each, keyboard traces, the accessibility tree; scripts
        and shots in the scratchpad's screens2): blocks — no field built on UiField has a name (it declares `for` as a
        prop and reads `$attrs.for`, never there: Settings' 13 boxes, Rename, the hex box, What you'd like); the help
        drawer's text can't be scrolled from the keyboard (focus on QDialog's wrapper, the body not focusable). Hard to
        use — dark theme: white on every solid button 2.82:1 (`--on-accent` white in both), danger banners 2.27:1
        (`--danger-ink` defined nowhere — the kit's fallback #b91c1c); the selected segment can't be seen (#fff on
        #fbfaf7, 1.04:1 — "The new color | On it now" records the wrong paint); the title bar's icon buttons (AI
        status, Back, Forward) and the AI page's radiogroup, images, switch and button have no name; toasts and the
        task strip likely unannounced (role=status inserted filled, no live region from the start, the bar no
        progressbar); no keyboard way to draw a Box and Box and pan need a drag (WCAG 2.1.1, 2.5.7); the side panel
        keeps the last tab's scroll. Looks wrong — a long path overflows the install card; field edges 1.25:1 / 1.44:1;
        the info banner's text 4.3:1; the slow and low-memory notes drawn as errors; card hints ~104–135ch wide; the
        split slider has no visible label; the hex box says Required when Tabbed through, the picker then hidden; the
        tabs' focus ring cut top and bottom; the Paint colors ⌄ buttons out of line; Your houses' cards on the header
        rule, the "?" alone on a row at 960; the VC++ link browser-blue; Reset shows the template's words ("demo
        seed", "projects"). Small — FSI/PDI marks in every name (braille shows them); names read twice (aria-label
        and an equal title; "No color" per row); the Settings tablist unnamed, no tabpanels, the AI page's tabs links;
        radio groups don't check on arrows; menus keep Tab inside (the kit's choice); "Load the X colors
        automatically" vs the visible "Load automatically" (2.5.3); "On this wall" an aria-label on a plain div; the
        AI page's scroller under its hardware card at 960 and a 4.49:1 sublabel; Logs and Updates a scroller in the
        panel's scroller, Advanced's JSON boxes 171 px for 3542 px; Change folder's question doesn't name the new
        folder; the AI photo dialog 1100 px for an 880 px card. Help vs screen — ai-features "Reset" (Reset to
        default), troubleshooting "Older than…", painting's and color-schemes' lowercase words, troubleshooting names
        only one connection reason (another person signed in, Windows reserved the port, the server stopped as it
        started), Reset Just House Paint and Load the colors in no page; "＋ Add model", the AI tasks' Run it again
        with no name, "Export backup…", "Working size (pixels)", "Show more (n left)", "Save “…”", "Pick a color";
        the install size in GiB vs "Not enough room" in GB; macOS's "macOS ." with no version. Right: no page scroll
        below 1024, tabs' keys, menus' keys, dialogs' focus, the paint grid's one stop, Undo/Redo keys, the canvas
        region and its zoom, toggles, rings, the no-color swatch's name, EmptyState centred, the connection page's
        five reasons, the install cards' states, right-to-left names shown in their direction, light contrast but
        two.
        Their fixes — decided (mine, argued; each against WCAG 2.2 / WAI-ARIA APG unless named): UiField's label points
        at its input (`props.for`); the help drawer's text a focusable named region, focused on open (axe
        scrollable-region-focusable); dark `--on-accent` near-black (#1a1a1a — 4.5:1 or more on the accent and the
        danger at every hue the appearance engine can set, measured; if the engine moves lightness it picks the ink of
        the higher contrast, Material's on-primary); `--danger-ink` and `--info-ink` defined in the contract and both
        themes, 4.5:1 on their banners' tints; a field-edge token 3:1 or more for inputs, selects and the segment's
        track; the chosen segment shown (accent-soft fill, accent ink, weight 600, an accent edge 3:1 or more);
        v-tooltip names an element with no name of its own and adds no description equal to its name, no `title`
        equal to an aria-label anywhere (v-tooltip instead), the AI page's radiogroup, images, switch and button named;
        toasts and the task strip announced through one live region present from the start (@react-aria/live-announcer
        — React Spectrum's, DOM only; errors assertive), the toast itself no live role, the task strip's bar a
        progressbar with its value, AiTaskStack's region always there; Box draws with two clicks as well as a drag and
        from the keyboard (the photo focused: a crosshair, arrows move it, Shift ten times, Enter sets each corner,
        Escape cancels), pan buttons beside the zoom while zoomed (2.5.7); the side panel back at its top on a tab
        change; banners wrap a long path (`overflow-wrap: anywhere`), a link in one takes its ink, underlined;
        UiBanner gets a warning intent (`--warn-bg` / `--warn-ink`) and the slow and low-memory notes use it; card
        hints capped at `--w-prose`; the split slider's label shown; the hex box checks only on Find (Quasar
        `lazy-rules="ondemand"`), the picker and Find on the box's middle; the tabs' ring inside the tab; Paint colors'
        ⌄ in one column; Your houses' cards off the header's rule (Paint colors' gap) and the "?" kept with its row;
        Reset in this app's words (houses, designs, paints — no demo, no projects); isolate() marks a name only when it
        holds a letter of the other direction than the page (Google Closure's goog.i18n.bidi ranges), plain names left
        as typed; a part row's swatch hidden from screen readers; Settings' tablist named and its tabs wired to their
        panels (APG Tabs), the AI page's tabs as tabs; UiSegmented checks on arrows (APG Radio Group — an off option
        takes the focus, never the pick); a menu closes on Tab and gives the focus back to its trigger (MUI's Menu —
        the kit kept Tab inside only from Reka's habit); the switch named by its visible words ("Load automatically"),
        the brand its description; "On this wall" a group; the AI page at 960 one scroller, its sublabel 4.5:1;
        Logs and Updates one scroller, Advanced's JSON boxes grow with their text; Change folder's question names
        the folder it makes; the AI photo dialog as wide as its card; the install size and "Not enough room" in one
        unit (the kit's one formatter); macOS's version said only when known; every help word as on screen,
        troubleshooting with each connection reason and its remedy, Reset Just House Paint and Load the colors in the
        help.
        The shell's fixes made (an agent's; not yet committed): the old folder stays whole — the move copies (sizes
        checked, each file fsynced), commits the pointer (fsync, renameHeldSync, the folder fsynced off Windows) or
        removes its copy and says why; the old copies recorded in the new root, Storage's Remove the old copy takes
        only what the move copied, never a folder in use; the next start's cleanup gone; the app's own folder (a Mac
        bundle) refused, the default allowed (the pointer dropped), moving back onto a default still holding its old
        copy refused by name; a start under way checked again before its fork, the move waiting up to 60 s for it (the
        reviewer's race: 1 fork, not 2); verbatimSymlinks (asserted; a real link unverified here — no symlink right);
        Quit held while copying (window, tray, before-quit, Restart now), a half copy removed at the next start only
        when the pointer doesn't name it; the token carried (`<new>/electron/carried.json`, read once at the relaunch,
        the first page opened with ?token=); `sameFileTime` (2 s) in the finder's and the AI photo's file checks; a
        lost lock reloads the window to its reason; loopback never proxied (platform/no_proxy.js — the reviewer's
        script now "status 200: direct"); partBytes by allocated blocks and only the install's downloads; the move's
        question names the apps sharing the models and the folder it makes; "Use the default folder from now on";
        on a coarse-time drive the lock in `<temp>/just-locks/` (70 s on FAT-like times: 0 lost — the reviewer's 3);
        EFBIG and the rest in words. The guard: launchers' # / rem / :: comments stripped, NODE_USE_SYSTEM_CA=1
        required; JustWrite's three false positives gone (publish's list form, git-ignored files, a clock tick); a new
        check that the server's required peers are installed (a peer counts when any package of the server's packed
        tree declares it — strict, it failed on hono, which the kit declares beside @hono/node-server). Kit core 1349,
        ui 51, template 48 + 54, app server 435. Open from it: JustWrite, JustVoice and docgen have no Remove the old
        copy (their sessions told); a data folder set by the variable or --data-dir still lets Change folder write a
        pointer the next start ignores — to fix: Change folder off there, saying where the folder is set.
        The kit's screen fixes made (an agent's; not yet committed): UiField names its input (a mounted test with
        dom-accessibility-api); the help's text a named region focused on open; dark --on-accent #1a1a1a (5.61 on the
        accent, 5.24 on the danger at the worst hue; the appearance engine moves only the hue — light white stays,
        4.89 / 4.86), solid danger/success/info buttons on --on-accent, dark hover lightening (6.18+); --danger-ink
        (5.83 light, 5.53 dark on its banner), --info-ink (6.94 / 7.71); --border-field #8a867f / #787c78 (3.21+ /
        3.25+); the chosen segment shown (6.29 / 6.70, edge 4.69 / 5.24) and picked on arrows; v-tooltip names a
        nameless control, link, image or role-bearing element (never a plain div) and adds no description equal to
        the name — the AI page's radiogroup, provider icons, warm-start switch, Back, Forward and the AI status
        button named; @react-aria/live-announcer NOT used — since 3.5 it needs React (3.4.4 the last React-free) — the
        same pattern in the kit (common/services/announce.js: one polite and one assertive log made at start), each
        toast announced and carrying no role, the task strip's bar a progressbar, a task's start and end announced
        once from the task store; AiTaskStack's region always there but not live (its seconds tick every half
        second — the announcer says start and end): kept, argued; UiBanner wraps, its links in its ink, a warning
        intent (the install card's slow and low-memory notes use it); the tabs' ring inset; isolate() only for a name
        of the other direction (Google Closure's goog.i18n.bidi ranges, Apache notice in the file and NOTICE.md);
        Settings' and the AI page's tabs real tabs wired to their panels; UiMenu closes on Tab (ids from useId — every
        menu had ui-menu-1); the AI area one scroller, Logs and Updates none of their own, Advanced's JSON autogrow
        (60vh cap); UiNumber on @internationalized/number's NumberParser 3.6.9 (".7", "5.", "15.", "+15", "1 500",
        ",5", Unicode minus, Arabic digits; "1,5" in an English whole-number field still refused; a refused text kept
        with its error); SyncPanel saves no empty box as 0; the disk-full words with the Install button's unit; macOS's
        version only when known; the AI photo dialog's install card at --w-edit; PaneHeader's "?" with its actions;
        the AI tasks' buttons named ("Run it again", "Dismiss"). Kit ui 52, template 50; the app's 10 tests that
        expected the old marks and the stack's v-if to be updated (mine). Left to me: RESEARCH facts, the app's
        NOTICE (Closure), the dedupe lists, a darker light --info (4.43 at hue 192), the peers' tests (the AI page's
        tabs no longer links — docgen's smoke, JustWrite's headless smoke and probes) and tokens.
        The fifteenth's fixes committed (app acb1b81 + 79e0400, kit 70e6df1 + 010360f: server 435, unit 175, e2e 16; kit
        core 1353, ui 52; template 52 + 54; JustVoice 261 + 1364, docgen 5 + 165; JustWrite 736 of 745 — its 9
        providerScope tests mount the kit's AI page, now on Quasar's tabs, in jsdom with no ResizeObserver: its test
        setup's to stub, sent to its session). Decided while making them: hints at most 70 characters, not --w-prose
        (640 px is ~100 characters at the hint's size — the typographic 45–75, WCAG 1.4.8's 80); the light --info at
        L 0.535 (white 4.64:1 at every hue); the reserved port's remedy in the help (a restart; as administrator,
        winnat stopped, an administered exclusion with store=persistent, winnat started — NetBird's Windows guide);
        the release's start check runs a temp copy of the build, and the kit's data-folder tests run on each runner
        (real links on macOS and Linux — this machine has no symlink right); JustWrite's template notes (a .deb's
        homepage, a universal Mac build's x64ArchFiles, the launcher's LF pinned). Dry run 39421285767 started. The
        sixteenth (2026-10-20): the fifteenth's code attacked, and the screens on the new build.
        Dry run 39421285767: macOS green; Windows and Linux failed at "the window and the server on its own share one
        data folder" — each start now runs its own temp copy, and their default folder is beside the executable, so
        the two paths differ by the copy (being fixed: the folder said where it is in the build itself, the runner's
        8.3 temp name resolved). Every other step green on all three: the packaged app and its server started from a
        temp copy (no package the build left out), the kit's data-folder tests with real links on macOS and Linux.
        The sixteenth's attack on the fifteenth's code (an agent's; scripts in the scratchpad's adv16): a second
        launch during Change folder sweeps the copy under way (the sweep and the token's pickup run before the
        single-instance lock — measured; narrowly the pointer committed to an emptied folder); Change folder from a
        start on the old copy forgets the newer folder (measured); "used after the move" warned when Finder or
        Explorer only wrote .DS_Store / Thumbs.db / desktop.ini (measured); an old copy on an unplugged drive
        forgotten for good; the old-copy banner stays after "from now on" or the new folder deleted; a half copy on a
        drive missing at the next start never removed; docgen's Change folder carries no token (it passes none);
        crash windows around the commit (records written after it; a move to the default, crashed before its marker
        went, swept as unfinished); a junction in the data folder fails every move ("not allowed to write there");
        Node 24.21's fs.rmSync recursive follows NTFS junctions and empties their targets (measured —
        fs.promises.rm doesn't; the kit's rmTree for Clear models and data_api unaudited); Move back offered while
        the default holds the old copy; the variable's words while the start fell back to the default; Remove
        doesn't name the apps sharing the models; the coarse-time lock per OS user. The UI and canvas: Enter in a
        number field submits the old value (and past its max); a refused text ("1e3", "0x200") passes the form's
        rules and Save sends null (422); a refused text with no rules has no error; ArrowUp on a refused text gives
        0 + step, changes a readonly box; "-0" kept; one failed task announced twice, both assertive; announcements
        outside an open dialog's aria-modal unheard; a keyboard Pick a color shows nothing (the panel at its top, the
        matches below); the hex box's error stays after the hex is fixed; a box begun by a click and ended by Enter
        ends at the pointer, not the crosshair; a half box survives a photo change; a two-tap box's 4 px slop under a
        finger's 8 dp; Enter held picks on every repeat, a handled Escape bubbles; v-tooltip's own-name test misreads
        aria-hidden text and a select's options; isolate() leaves a Latin name holding an override character
        unwrapped; UiSegmented picks on Ctrl/Alt+arrows, its arrows not mirrored right-to-left; the canvas's
        lostpointercapture never attached (mounted before the stage — the fourteenth's fix inert; measured). Right:
        the kit's tests, fs.promises.rm leaves a junction's target, removing an old root that is a junction keeps
        the user's files, the fork held, Quit held on every route, no reload loop, the variable read alike, Remove
        only on recorded copies, the guard's peer check on the real tree, number parsing in en/de/es/fr/de-CH ("1,500"
        is 1500), toasts carry no role, v-tooltip leaves aria-labelledby and <label for> names, the Tool control and
        On it now by arrow, menus and tabs, the help's focus, the crosshair clamped.
        Their fixes — decided (mine, argued): the single-instance lock first, then the sweep and the token, and the
        sweep skips a move whose process is alive (its pid recorded); Change folder, Move back and the variable's
        words off while a start runs on the default this time or on an old copy — "your data is in B: connect it and
        restart, or Use the default folder from now on"; "used after the move" judged by the database's files alone
        (*.db, *.sqlite and their -wal/-shm/-journal — a run always writes them), Thumbs.db never one; an old copy whose
        drive isn't there listed as not connected, forgotten only when its drive is there and its entries gone;
        "from now on" removes the default's moved-to record, the banner gone when the folder it names is; the sweep's
        record kept while the target can't be reached; the shell reads the window's token itself in storageRelocate
        (no app passes it — docgen too); the old-copy record and carried.json written into the target before the
        commit (an undo removes them), the marker marked committed before the pointer; a link in the data folder
        copied as a junction on Windows when it is a folder's (junctions need no symlink right), else named in the
        refusal; every recursive remove in the kit on fs.promises.rm (a kit test proves a junction's target stays;
        rmTree and data_api audited); Remove names the apps sharing the models; the lock per OS user kept, argued
        (the fixed port refuses a second user's server anyway). UiNumber: Enter commits the text as blur does
        (clamped), a refused text fails the field (its own rule first, aria-invalid) with or without rules, arrows do
        nothing on a refused text or a readonly box, "-0" is 0; a failed task announced once; announcements inside
        the top open dialog while one is; the keyboard Pick a color scrolls the exact color's matches into view and
        says how many; the hex box's error cleared as it is typed into; keys take over a box a click began (its
        corner the crosshair's); a photo change drops a half box and the crosshair; a touch's slop 10 px; Enter
        repeats ignored, a handled Escape stopped; v-tooltip's own-name test by dom-accessibility-api's
        computeAccessibleName (Testing Library's, already a dev dependency); isolate() wraps any name holding a bidi
        control; UiSegmented ignores modified arrows and mirrors them right-to-left (APG); lostpointercapture heard
        on the canvas's own host element, always there.
        The sixteenth's screens (an agent's, the build of 9692270 / 475ad42, 261 shots and 35 keyboard ones with a probe
        each, the accessibility tree; scripts and shots in the scratchpad's screens3): hard to use — the AI tasks panel
        from the keyboard (Enter opens it, the focus stays behind; its Run it again the 18th stop, four stops hidden
        under it — WCAG 2.4.11; Escape drops the focus on <body>; no aria-expanded); five selects named only by their
        value (Appearance's Theme, Interface size, UI font; Logs' two). Looks wrong — hints ~100 characters a line
        (70ch is 580 px: a "0" is wider than the average letter); the AI photo dialog's banners 767 px wide; Storage's
        two buttons touching (.card__actions no gap); the error toast 4.35:1 and light in the dark theme; the
        sidebar's AI-tasks error count 4.23:1 in dark; Pick a color's swatch edge 1.26:1; the hex row top-aligned, not
        on the box's middle; Reset's 35-word sentence as its field's label, in small capitals; at 960 the panel 242 px
        (the header's two rows and the tools' three). Small — field names in capitals (Chromium takes the label's
        text-transform into the name); the sliders' number boxes named "Texture 1"; every banner role=alert;
        a keyboard Pick a color said nothing (fixed meanwhile); Box offered with the finder not installed, its toast
        "…installed. download the part-finding model first"; an empty number box sent as null (the server's 422);
        Backup & restore's hint the template's words; Settings' unselected tabs pointing at panels not in the page;
        Advanced's JSON boxes at the 60vh cap (as decided); the fallback folder JustHousePaint\JustHousePaint.
        Help — "Load the colors" in no page; color-schemes' lowercase names (lines 19–20); finding-parts' "keep";
        getting-started's "Change folder is off" (it isn't shown). Right — every field built on UiField named, the
        help's text by keys, the contrast everywhere else (261 probes), field edges, segments, icon buttons named,
        the live logs (and in an open dialog), tabs, menus, one scroller each, number boxes, Box by clicks and keys,
        the pan buttons, the panel's top, Line, Required only on Find, the ⌄ column, the cards' gap, the "?", names
        once, isolate on Hebrew only, Storage's states, the connection reasons.
        Their fixes — decided (mine, argued): the AI tasks panel on Quasar's QDialog position="right" (modal: the
        focus in it, Tab kept in it, Escape gives it back to the trigger — Quasar's own), the trigger with
        aria-expanded; every select named (UiField's for to the select, or its aria-label); hints at most 35em and the
        lede and notes 38em (about 70 and 75 characters at their sizes — em, not ch), measured; a banner's text
        capped the same; .card__actions a wrapping row with a gap; the toast themed (the danger ink on the danger
        tint, dark in the dark theme); the error count in --danger-ink; Pick a color's swatch edged in
        --border-field; the hex row centred on the box (the rule's words under the box, shown only after Find, move it
        a little — kept); Reset's sentence as its prompt's message and the field "Type RESET to confirm"; field labels
        in small capitals by font-variant-caps (the name keeps the words' own case); the sliders' boxes named by the
        slider; info and warning banners role=status, danger alert; Box off with its reason while the finder isn't
        installed, the server's words "Install the part finder first" (and the AI photo's alike); an empty required
        number box says Required before anything is sent; Backup & restore's hint in this app's words; a tab's
        aria-controls only to a panel in the page; the help's words as the screen. Kept, argued: the panel at 960 (the
        window's smallest; the panel scrolls; moving the header's actions costs finding them); the JSON boxes' cap;
        the fallback folder's name (platformdirs' Windows layout, author\app — moving it strands data).
        The sixteenth's shell fixes made (the agent's; not yet committed): the single-instance lock first, the sweep at
        whenReady and never a move whose process is alive (two real processes: the copy left alone, the move
        committed); no move while a start runs on the default this time or on an old copy ("Your data is in <B>:
        connect it and restart…"); "used after the move" by the database's files alone; an old copy on a missing drive
        "Not connected", kept; "from now on" removes the moved-to record; a half copy's record kept while its drive is
        out; the shell reads the window's token itself (just.serverToken); the records and carried.json written before
        the commit, the marker committed first; folder links moved as junctions on Windows, a file link refused by
        name (unverified here — no symlink right); every recursive remove in the kit on fs.promises.rm
        (junction_removers.test.js: five removers, each leaves a junction's target whole); Remove names the sharing
        apps, Move back hidden while the default holds the old copy; the guard's peer check counts a peer only when
        Node resolves it from the package that needs it. Kit core 1369; the app's and template's Storage tests 16 / 13.
        Local Windows: the four start checks (the window, the server on its own, both on the default folder) pass from
        temp copies and name one folder.
        The sixteenth's UI fixes made (the other agent's; not yet committed): Enter in a number box does what leaving it
        does (read, clamp) before the form submits; a text that isn't a number fails the field with or without rules
        ("1e3", "0x200", "5 min"), aria-invalid; arrows do nothing on a refused text or a read-only box; "-0" is 0; an
        emptied box whose schema takes no null says Required before sending (schemaRules marks nullable); a failed task
        announced once, by the task store (reportError sees the mark); a modal dialog gets its own live regions while
        it is open (Chromium keeps outside text in the tree — measured, headless Edge 155 — but VoiceOver and NVDA
        confine themselves to a modal); v-tooltip's own-name test by dom-accessibility-api 0.7.1 (a runtime peer
        now); isolate() wraps any name holding a bidi control; UiSegmented ignores modified arrows and mirrors them
        right-to-left; the AI tasks panel on QDialog position="right" (focus in, Tab kept, Escape back to the trigger;
        its triggers aria-haspopup, aria-expanded, aria-controls); the selects named (Appearance's by their rows,
        Logs' "Day" and "Lines shown"); a banner's text at 38em and its box as wide as its text (kept, argued: the
        user's layout rule — a control sized to its content, nothing stretched to the page — though it changes every
        banner in every app); the error toast on --danger-ink / --danger-bg (6.99 / 7.17); Pick a color's swatch in
        --border-field (3.21+); Reset's sentence as its prompt, "Type RESET to confirm", Reset off until it is typed;
        field labels in small capitals by font-variant-caps at 14 px (to be seen on screen); a slider's box named by
        the slider; info and warning banners status, danger alert; a tab's aria-controls only to a panel in the page;
        a toast's second line capitalised, announced "Title. Detail.". Kit ui 54, template 70. Mine meanwhile: the
        hint at 33em, the lede 35em; Storage's buttons apart; the error count in the danger ink; the hex row on the
        box's middle; Box off until the finder is installed and the server's words "install it first, on a house's
        Parts tab"; a picked color's matches brought into view and said; the hex box's error cleared as it is typed
        into; keys take over a box a click began; a photo change drops a half box; a finger's slop 10 px; Enter
        repeats ignored, a handled Escape stopped; lostpointercapture on the host; Backup & restore's hint in this
        app's words; the help ("Load the colors", the schemes' names, Keep the parts you changed by hand, Change
        folder… isn't shown); the e2e's AI-tasks toggle on the modal panel (its backdrop, Escape, the focus back).
        The sixteenth's fixes committed (app 5a9c641, kit f066ec9: server 435, unit 182, e2e 16; kit core 1369, ui 54;
        template 70 + 54, e2e 12; JustVoice 261 + 1364, docgen 5 + 165; JustWrite 740 of 745 + 180 — its tests pinned to
        the backdrop rule's old selector and to AiStatusPanel's dismiss composable (now QDialog's), and its boot smoke
        timing out under load (alone 1/1): sent to its session). Found while checking: two kit tests held a move and
        failed under load without letting it go, so every later move in the file was refused — they wait 15 s and
        always end it now. The app's server removes only with fs.promises.rm (checked). Dry run started; the
        seventeenth (2026-10-20): the sixteenth's code attacked, and the screens on its build.
        Dry run 39428267423: Ubuntu and macOS green at every step (the kit's data-folder tests, the packaged app and its
        server from temp copies, one data folder shared — the start check's fix holds); Windows failed at the kit's
        data-folder tests: its runner has the symlink right, so it ran "a relative link stays relative", and the
        sixteenth's refusal of every file link on Windows refused it — wrong: it blocks Change folder for anyone whose
        model cache holds file links (Developer Mode, administrators). Being fixed: the refusal only when this process
        can't make a link (probed once in the target), links copied as they are when it can. From JustVoice: its own
        rmSync recursive emptied a junctioned folder's target the same way ("Clear speech models", its factory reset —
        fixed there, 70bf2234). From JustWrite: the boot smoke's fixed 15 s failed under a parallel run (kit 9557b67: a
        timeout option, 60 s by default).
        Fixed (kit 6e850f1): the move probes once whether it may make a symlink — with the right every link is copied as
        the kind it was (junctions as junctions; PowerShell's LinkType tells them apart — NOT STANDARD, RESEARCH §2),
        without it folder links become junctions and a file link is refused by name. Dry run 39429983087 green on every
        runner, linux-user too: Windows ran all 67 data-folder tests (the link ones with the right), Ubuntu and macOS 63
        (4 Windows-only skipped); the packaged app and its server from temp copies, one data folder shared (Ubuntu
        beside the build, macOS in Application Support); engines: Ubuntu 22.04 the AI photo not offered (glibc 2.35 <
        2.38), macOS metal, Windows cpu; the finder's runtime on all.
        The seventeenth's screens (an agent's, the build of 5a9c641 / f066ec9, 285 shots with a probe each, keyboard
        traces, the accessibility tree; in the scratchpad's screens4): hard to use — a picked color's matches not
        brought into view when the pick comes from another tab (the usual case: the smooth scroll runs before the
        color grid's first search lands, which then pushes the heading ~4000 px down — measured); Save in Settings →
        General drops the focus on <body> (Save disabled once nothing is left to save — WCAG 2.4.3); the Logs'
        warning lines 2.82:1 in dark (they ask for --warning-ink, a token that doesn't exist — the contract's is
        --warn-ink). Looks wrong — in the narrow side panel a banner's icon alone on a line above its text, and
        Storage's banner action under the icon (the new flex: 1 1 auto overrode QBanner's .col; flex-basis 0 tested in
        the page fixes both and keeps the fit-content width); 38em is 77–84 characters; the units ("(MB)") 38% taller
        than the small-caps labels; the kit's own hints and notes uncapped (Backups 106 and 133 characters, Storage's
        used-after note 104, AI Settings' lede 96 and Quick setup's line 91, Updates' What's new 137); hints at 33em
        71–77, the lede at 35em 78. Small — Box's reason only a native title (nothing on screen on focus or touch);
        the dialogs' label still uppercase (Reset's box named "TYPE RESET TO CONFIRM"); Reset off for "reset" with
        nothing said, its box 376 px for five letters, its × also "Cancel"; the AI photo dialog 880 px around 512 px;
        the info banner wears the warning triangle; the sidebar's AI tasks row title equal to its text; the toast's
        close 20 × 20 (WCAG 2.5.8 asks 24); the hex error doesn't say the form (3.3.3); two controls named "Pick a
        color"; the chips named "SW T-121 Shade 21" against "Shade 21 T-121" on screen (2.5.3); the chips' edges
        1.25 / 1.44:1. Right — the AI tasks dialog (focus in, Tab kept, Escape back, aria-expanded, both triggers, its
        live log), every select and slider box named, names in their case, banner roles, tabs, Storage's gap, the
        error count 8.08 / 7.23, the toast 8.11 / 7.20 and dark in dark, the swatch edge 3.46 / 4.04, the hex row on
        the middle and its errors clearing, Box off and its fall-back, two clicks / keys / click-then-keys one POST
        each, number boxes (Enter, refused texts, Required, -0), Reset's prompt, no unnamed control on 17 pages, no
        overflow, one scroller per area, the connection page, the help's words.
        Their fixes — decided (mine, argued): the matches brought into view once the grid's first search has landed,
        without the smooth animation; Save keeps the focus where it was (back to the box, or Save stays focusable
        with aria-disabled — the APG's focusable-when-disabled) — in the template too; the Logs' warn ink from
        --warn-ink; QBanner's .col back (flex-basis 0) under the text cap; banner text 34em; .ui-unit at 0.8em; the
        kit's hints and notes at 30em, ledes and the changelog at 33em; the app's hints 30em and lede 33em (measured
        worst lines 70 / 75); an off segment's reason shown on focus and hover through the kit's tooltip, and Box's
        refusal said in a toast when pressed (UiSegmented's blocked); the dialogs' label in small capitals by
        font-variant-caps; Reset's word matched in any case, its box a token's width, its × "Close"; the AI photo
        dialog sized to its card; an info icon (Lucide's) on info banners; the AI tasks row without its title; the
        toast's close 24 × 24; the hex error "# and six digits, like #a1b2c3"; the picker's button "Choose a color";
        a chip's name starts with its visible words; the chips' edges in --border-field.
        The seventeenth's attack on the sixteenth's code (an agent's and its fork's; scripts in the scratchpad's
        adv17): loses data, rare — Remove the old copy can delete another stick's data put in the same drive letter
        (connected meant only "its parent exists" — measured with subst), and an empty stick there forgets the real
        old copy; a house switched mid-stroke or mid-box gets the old photo's drag (the photo watch kept the active
        pointer — measured). Breaks — a second launch during the start's sweep makes two windows, one never loading
        (the sweep now awaited before the window — measured in real Electron with a 60k-file half copy); the AI tasks
        modal's see-through backdrop takes the page's first click and drops the focus on <body>. Wrong — a "Use the
        default folder" start orphans a half copy in the default and Move back is refused for good; a stop inside
        the pointer's write leaves a full copy judged committed (never swept, its token in plain text, its record
        naming the live folder as an old copy); an interrupted restore's undo leaves 2 s where the folders and the
        tables disagree (an awaited rm between the folders' renames); Clear models and a model's Delete through a
        junction report bytes freed and free nothing, then replace the link with an empty folder; a failed task said
        with the HTTP status line; isolate() escaped by a stray PDI; "connect it and restart" said when the data's
        folder is connected and a restart won't help; the banner's icon alone above its words (being fixed); a
        deleted parent folder read as a missing drive for good. Small — a dead move's pid reused reads alive (the
        check is redundant with the single-instance lock); oldCopyOf's existsSync on an offline share blocks the main
        process 21 s; the undo's leftovers ignored (a held electron/ keeps the token); POSIX absolute links inside the
        data still point into the old copy; houses.test.js:172 passes by timing; the units' size; a message said in
        the tick a dialog opens or closes is lost; the wheel over the modal's backdrop scrolls the page; the nullable
        flag lost on a copied rules array; UiNumber's aria-invalid before its words; sentence() capitalises "sd-cli"
        and "macOS"; the Colors tab's count said after the tab is left, and zero matches said while nothing shows; Box
        "off until installed" before the status has loaded or when it failed; start-packaged's realpath on a missing
        folder, and its --default-data on macOS using the real Application Support folder; Reset's "RESET " with a
        space. Right — the move and relaunch in real Electron (B's lock, the token carried and taken, carried.json
        gone), junctions of every shape, the guard's peer check on all five trees, "used after" never set by the
        app's own close, UiNumber's Enter order and IME, the tooltip's cost (120 chips 34–46 ms against 35–42),
        dialogs' announcements nested, the AI tasks panel's focus, selects and tabs, UiSegmented, the small-caps
        labels at 960, the canvas's keys and edges, the plurals, the Box watch, the dry run.
        Their fixes — decided (mine, argued): an old copy known by its volume (recorded at the move —
        statSync().dev, the volume serial on Windows) and by its own moved-to record naming this root — anything else
        reads as not connected, never removed; another photo drops the active pointer, its stroke, box and pan;
        the window and the tray made first, then the sweep, then the server — a second launch only shows a window
        that exists; the AI tasks modal kept with its see-through backdrop (the family's no-dim ruling of
        2026-07-19, and the kit's menus close the same way on an outside click), the focus back to its trigger after
        any close; a "Use the default folder" start clears an uncommitted half copy into its own folder before the
        server starts; committed judged by the pointer (it names the target, or there is none and the target is the
        default) — the flag gone; the restore's undo renames a folder aside synchronously and removes it after; Clear
        models and Delete empty a linked folder and keep the link; a failed task said in the server's words;
        isolate() strips the bidi controls from a name before marking it; the words when the data's folder is
        connected: "restart the app to use it" — or, on the variable's old copy, "change the variable to <B>"; a
        missing drive told from a deleted folder by the volume's root; the pid check dropped (the single-instance
        lock covers it); oldCopyOf off the main thread's sync calls (async, with a timeout); the undo says what it
        couldn't remove, the token's file removed first; POSIX absolute links inside the data re-pointed into the
        copy as on Windows; houses.test.js awaits the removal it checks; the units at 0.8em; a message said while a
        dialog opens or closes waits a tick for the right regions; the wheel over the modal's backdrop doesn't
        scroll the page; the nullable mark kept on a copied rules array; aria-invalid only with its words;
        sentence() leaves a first word with a capital or code characters as it is; the Colors tab says nothing once
        left, and says no match where it shows; Box off only once the finder's status says it isn't installed;
        start-packaged's realpath guarded, and its --default-data on macOS and Linux under a temp HOME (never the
        developer's real data); Reset's word trimmed.
NEXT (mine): the reviews until a fresh angle finds nothing; then, only when nothing is open, the release (v0.1.3) and
        the installed 0.1.2 updating to it (the silent Restart now).

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
DONE 2026-10-19 (under "fix we spots and anything else, do it all"): 26 Commons photos the 10/17 probes had already
        fetched (no download), the recipe on each, overlays reviewed (RESEARCH §13). Found and fixed: neighbors' windows,
        doors and soffits painted (the house rule took every "house" instance) — the house is now the main instance
        alone. Obstacles in front stay out on 25 of 26; cutting "tree"/"bush" out was measured and NOT done (it would
        cut the house behind a bare tree; the one leak, an evergreen's edge, isn't in its mask) — an Eraser fix.

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
v0.1.1 (2026-10-19): the kit and template items done (the kit's TASKS, the template audit) — what reaches this app:
        Settings → About, Server and Storage are the kit's panels (this app's copies gone), a browser on another
        computer signs in with the server's token, and a failed warm start offers the troubleshooting page.
        Checked before the tag: lint, 345 server and 92 renderer tests, i18n, the guard, the smoke 13/13 on the kit's
        eb5d966. RELEASED (run 39313711632, the feed checked). The installed v0.1.0 updated itself: the start-up check
        found 0.1.1, Download took 6 s — and Restart now opened the setup WIZARD (the kit's quitAndInstall without /S);
        the same installer with /S upgraded in place in 15.8 s, the data folder untouched (RESEARCH §12).
v0.1.2 (2026-10-19): Restart now installs silently and restarts (the kit's 8a9b3fb, a test pins it). An install of
        0.1.0 or 0.1.1 still shows the wizard this once (their shell is the old one); What's new says so. RELEASED (run
        39315855260, the feed checked). The installed 0.1.1 → 0.1.2 as those users will: found, downloaded in 2 s, Restart
        now → the wizard, Next, it installs, Finish (Run Just House Paint ticked) → the app at 0.1.2 in 0.6 s, its data
        untouched. LEFT: the first update FROM 0.1.2 is the one that shows the silent Restart now — check it then.

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
