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
OPEN:   - the user's house: run 2026-10-18 (RESEARCH §11) — a thin trim line on the parked SUV's window and the
          gable medallions in the body are left for the Eraser / Box; the obstruction test set is next (below);
        - trim recall: better with the new default recipe, but corner boards, friezes and skirts still land
          in the body (RESEARCH §11) — the Box tool is the fix today;
        - the AI photo's time (22–61 s) and the AI schemes' (16–99 s) vary widely between runs on the same
          inputs (RESEARCH §11) — not explained;
        - a browser on a server that requires access tokens can't use the app at all: no family app gives
          the kit's transport a token (the kit's TASKS) — the pictures now go through that transport
          (the kit's `UiServerImage`, 2026-10-18), so they follow when it does;
        - the phone build: the server bundle can't carry sharp, onnxruntime-node or sd-cli; Capacitor stays
          for later (PRD: out of scope for v1).

## Next features — proposed, waiting for the user's go [2026-10-18]
ASKED:  the user, verbatim: "i think the outlines should hide and show depending on what part you have
        selected, if door is selected only door outline, what do you think, any other features or
        suggestions for this app, think adverserially, also need a reset back to default colors".
MY RECS (shown 2026-10-18, each argued against first; ranked):
        1. Undo / Redo (Ctrl+Z / Ctrl+Y) for colors and outline edits — today a wrong Eraser stroke is saved
           to the server at once; the only way back is "Find the parts again", which drops every other fix.
        2. Outlines: Selected part · All parts · Off (a three-way control in place of the switch; default
           Selected part — the user's ask). The attack kept "All parts": only-selected hides what the
           finder got wrong (the SUV window's trim line). The Parts tab follows the choice too.
        3. Reset — the user's word "default colors" has two readings, ASKED which (or both): (a) take all
           paint off, the photo as taken; (b) back to the open design's saved colors. The attack: with
           Undo (1) a mis-clicked Reset isn't permanent.
           DECIDED 2026-10-18, the user, verbatim: "on reset both" — two actions: (a) take all paint off (the
           photo as taken) and (b) back to the open design's saved colors (shown only when a design is open
           and has unsaved changes). Labels proposed, not yet confirmed: "Remove all colors" and "Back to
           “{design}”". Built with Undo (1), on the user's go.
        4. An eyedropper: click the photo to read a color (the trim, a neighbour's house) → the brand's
           nearest paints; the Parts tab shows each part's current color and nearest paint (touch-ups).
           Labelled "as photographed" with the ΔE — light and shadow are in the photo's colors.
        5. Compare two designs: the before/after slider between two saved designs.
        6. Zoom buttons (+, −, Fit) — the wheel only today.
        7. A one-page "color card" (the painted photo + the paint list) — low: Save image and Copy the
           color list exist.
        8. Soffits — the user, verbatim: "also shouldnt we be able to select and identify soffets?". Today
           neither: the finder has no soffit part and "Add the part" offers only the recipe's parts. My rec:
           a paintable "soffit" part (trim group; a scheme's trim color paints it), its words measured on
           the four photos first ("soffit", "eaves", "roof overhang" — the one that finds them without false
           hits; ~2 s a word per photo); kept in the recipe even when the finder misses it, so it can be added
           and drawn with the Box or the Brush. With the obstruction test set, or alone on a go.
        Dropped after the attack: a paint quantity estimate (a photo gives no real wall sizes — it would
        mislead); a sheen/finish preview (the tint can't show sheen honestly); "order a sample" links (the
        brands' terms, the not-affiliated notice); several photos per house (v2-sized).
GO:     the user, verbatim: "on the other features do it all go" (2026-10-18) — recs 1–8 as shown, Reset as
        decided ("on reset both"). The port move (below) is not a feature: still waiting.
ASKED:  the user, verbatim: "what happened to the before after slider i liked that?" (2026-10-18). It is the
        "Compare with" choice "The photo as taken". Shown: A keep "Compare with" as built; B rename it "Before /
        after" (my rec); C bring back the one-click switch beside a design-only Compare.
DECIDED: the user, verbatim: "A" — "Compare with" stays as built.
        9. Window trim — the user, verbatim: "can we idetify the window trim as a part, if so we should add that as
           well". Today "window trim" is one of the Trim part's three words, so the casings take the trim's color.
           My rec (shown 2026-10-18): its own paintable part "Window trim" — the word moved out of Trim's; trim group
           (a scheme paints it the trim's color); after the windows and before the trim in the priority; measured
           alone on the four photos first and kept only if it finds casings without many false hits (threshold
           0.3–0.5), else left in Trim; then added to the user's settings and the house's parts found again.
GO:     the user, verbatim: "your rec on all just think on it again go" (2026-10-18) — the window trim rec, the
        rest of this batch (the help's Compare line, the real run on the user's house, TASKS, the commit), and the
        recs still waiting: the port move (below) and the kit's shared-cache warning (the kit's TASKS).
FOUND:  the user (2026-10-18), verbatim: "the window trim i think you are not getting the correct it whould be the
        windows the white part the wood, in my house picture you are not selecting that, can you check" — and:
        "the frame is what i am talking about when i say window trim so lets rename to frame". Checked on the
        overlay: the white casings around the two big front windows sit in Windows (SAM 3's "window" outline takes
        glass and frame, and Windows wins the overlap), so Window trim got only thin rims. Next: measure the glass
        ("window pane", "glass") so Windows = the glass and the frame part = the rest of each window; the label
        asked ("Window frames", my rec, or "Frames").
STATE:  BUILDING.

## Every AI task shows its progress — the template's gap [2026-10-18]
FOUND:  the user, verbatim: "your not following standard ai progress bar and tasks as per part of our standard app
        design no feedback on any ai task no progress bar"; "this should be part of any ai and part of our just product
        template, why did you not use our standardd desgin that was the whole point of the temolate"; "the standard is
        that we use ai task panel and the ai progress bar, this is standard for any ai task and has always been, why is
        it not standard in this app and the new template?". Root cause: app-structure §8's in-place AiTaskStrip was prose
        only — the template's AI example never mounted it, nothing checked it, and my jobs.js assumed a global strip.
GO:     the user, verbatim: "think on how to fix this again, and think on the template, i want all apps the same i dont
        want any missing parts like this, how can you fix it so we get all common parts, this should not have happened";
        then "so i asked you repeated to think on a good template design and you failed, do it right fix it rightk, do it
        professional, think adversially of the fix and go code it".
BUILT:  2026-10-18 — the kit (bc34207): a global task stack every app mounts, in-place strips that claim their task,
        useSurfaceTask, the template's example and tests, the guard's check 17, app-structure §8. This app: in-place
        progress on Find the parts and AI photo (under the house's name), Suggest schemes, the two installs (on the
        card) and a brand's colors loading (above the list); each trigger disabled while its task runs; job progress as
        a percent; a mounted test holds a find job open and checks the page. Verified: 50 renderer tests, the guard.
OPEN:   - the audit the user asked for ("all common parts"): every standard in app-structure, where it lives (kit code,
          template code + test, prose only) and what checks it — each prose-only one becomes code + a check;
        - a screenshot of the progress in the real window, during Find the parts on the user's house.

## Window trim = frame, casing and sill [2026-10-18]
DECIDED: the user, verbatim: "yes windows trim = frame caseing sill" and "you can leave it as window trim or frame what do
        you think it should be all 3 as you noted" — my rec: keep the name "Window trim" (the trade word for all three;
        "Frames" would leave out the casing and the sill). Windows becomes the glass only.
BUILT:  2026-10-18 — measured (RESEARCH §11): "window glass" finds the glass on all four photos; Windows = "window
        glass" at 0.3, Window trim = ("window" ∪ "window trim" at 0.5) minus Windows (the recipe's new `minus`). On the
        user's house Window trim is 4% of the house (was 1%): the white frames and casings round every window, painted
        black in the real desktop app with ΔE 0.0; the coral bands stay Trim. A better default now reaches an existing
        install: a setting still at an earlier default (its fingerprint in previous_defaults.js) takes today's, an edited
        one is never touched — the user's finder.parts was upgraded on the next start. Verified: 324 server tests, e2e
        13/13, the desktop run (every feature, no page errors).

## More paint brands than Behr [2026-10-18]
ASKED:  the user, verbatim: "also the only paints i see available to select from are behr i thought we had a wide range
        of paints to choose from?"; "behr is the only one in the dropdown"; "ok but user dosnt know that all they see is 1
        dropdown seletion, and why do we have a button import why is it not just automatic for all?". Only Behr was
        loaded (the real run); loading stays user-started by the decision of 2026-10-17 (B, the brands' terms).
MY REC (shown 2026-10-18): 1. on the Colors tab under the brand list, while brands are missing: "More brands" with one
        Load all for the four public lists and links to the two palette downloads; 2. Load all on Paint colors; 3. check
        whether Benjamin Moore's and PPG's palette files sit at stable addresses, so they can join Load all. And: load the
        four public lists on the user's computer now (a download — needs the user's OK). Waiting for the user's go.
DECIDED: the user, verbatim (2026-10-18): "look lets juest have a setting that says auto load on off per each provider
        with them being on, that is the same thing as having a button user can turn off if they want but out of box
        eveything just works, make it all just work!" — this replaces the decision of 2026-10-17 ("B as a setting you
        turn on"): every brand loads by itself unless turned off. Asked then: "and what do you mean about the load from
        file, do we have afile to load" — no: Benjamin Moore and PPG / Glidden publish palette files on their sites
        (RESEARCH §10); my rec: the app fetches those too, so all seven load by themselves.
BUILT:  2026-10-18 — the setting `paints.autoLoad` (every brand on; seeded, so an existing install gets it on its next
        start); at start-up the shell loads each brand set to load, fetchable and still empty, one after another, as
        tasks (the kit's stack shows them; a failure stays on the brand's row, no toast); "Load automatically" per brand
        on Paint colors (on with no colors → loads at once); the Colors tab says how many brands wait on Paint colors.
        Verified: 320 server and 51 renderer tests (the start-up loads: which, in order, a failure doesn't stop the
        rest, a second call joins the first), lint, i18n, the guard.
BUILT:  2026-10-18 — Benjamin Moore and PPG / Glidden load like the others: the app reads the brand's palette page and
        its current file links (paints/files.js) with the Import button's importers, so "Load automatically" covers all
        seven. On the user's computer: Benjamin Moore 4,056 colors (4 s), PPG / Glidden 2,108 (2 s); all seven loaded,
        ~17,100 colors (RESEARCH §10). Import stays for a brand that moves its files.
GO:     the user, verbatim (2026-10-18): "confirm what color list download?" — shown: the four public lists (SW's host,
        JSON) and Benjamin Moore's collection ASE files and PPG's 2025 XLSX, with the brands' terms; then "i just want it
        to work well, think on it and if it works well your rec go" and "color list is fine go".
ASKED:  the user, verbatim: "is there any paint manufactures that dont forbid download or that we can get updated list
        without violation?" — answered from RESEARCH §10 (none found with an open licence; official downloads and the
        permission request are the cleanest); a research agent checks the other makers (2026-10-18).
NOTE:   the four public lists loaded on the user's computer at the app's start-up (Sherwin-Williams 1,948, Valspar 1,596,
        HGTV Home 900, Dutch Boy 1,340) — the setting doing its job. The e2e smoke turns Load automatically off in its
        fresh folder (it had fetched three lists from the brands' sites).

## What's next — the go [2026-10-18]
ASKED:  the user, verbatim: "whats next on this app". MY RECS (shown 2026-10-18, in this order): 1. fix what the template
        audit finds (here and in the template); 2. trim recall — measure "window surround", "molding", "band", "corner
        board" on the four photos, keep only what helps without false hits; 3. a design saved before soffits and window
        trim existed leaves them unpainted — opening it offers to paint the trim-group parts the design's trim color; 4. a
        mounted test for Paint colors (Load automatically, its progress); 5. the installer built, installed as a user would,
        run on the user's house. Later: the obstruction test set (download OK needed), the brand permission letter (the
        user's to send). Not started: the AI photo / schemes timing, the template's copied sections into the kit, the phone.
GO:     the user, verbatim: "your rec go" (2026-10-18) — 1–5. The attack on 3 changed it from painting the new parts
        silently to a one-click offer: an old design can't tell a part that didn't exist from one left unpainted on purpose.
1:      the template audit (just-core docs/plans/2026-10-18-template-audit.md; the kit's TASKS tracks the kit side). Here:
        the AI status button, title bar and fonts take the kit's (the picker's fonts now bundled); the Schemes and
        Colors tabs' dead ends are the kit's EmptyState with Add paint colors; numbers in the app's language; a
        NOTICE.md (samexporter's port, the kit's notices, the fonts' OFL); a connection page test. Left as allowed:
        the two raw q-btn swatches (no kit shape for a color chip).
3:      DONE (2026-10-18) — opening a design that leaves trim-group parts unpainted offers "Paint them the trim's
        color" (Designs tab, the kit's UiBanner, info look); nothing painted unasked; one Undo; the offer goes when
        it would no longer be true (another design, Reset, a new trim). Choices the approved text didn't cover, for
        the user to confirm: a part painted by hand drops out of the offer; the offer stays across tab switches;
        it sits under the designs list. The Designs tab's empty states are the kit's EmptyState.
4:      DONE (2026-10-18) — src/pages/ColorsPage.test.js (6 tests). It found and we fixed: a failed load's reason
        now shows on its row at once; Benjamin Moore and PPG say "palette file"; a brand loading from start-up
        disables its row and shows in the page's strips (the kit's AiTaskStrips).
2:      DONE (2026-10-18) — no word kept: RESEARCH §11 "More trim words — none kept" (a gain on house1, a wrong
        move of the user's coral bands on theirs).
STATE:  BUILDING.

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
STATE:  BUILDING.

## The server's port clashes with JustWrite's eval [2026-10-18]
FOUND:  by the JustWrite session (2026-10-18): this app's server port 17497 is JustWrite's eval port
        (`npm run eval`, scripts/eval.js `JW_EVAL_PORT || 17497`), and 17498 its flow tests
        (tests/flows/global-setup.js `JW_FLOWS_PORT || 17498`). The kit's generator reserved only 17496
        (new-app.js RESERVED), so `/new-just-app` handed out 17497. With this app's server up, JustWrite's
        eval can't bind (it runs on JW_EVAL_PORT=17499 meanwhile).
MY REC: reserve 17497 and 17498 in the kit (new-app.js RESERVED, the guard, app-structure §1's note) and move
        this app to 17499 — its server default (version.js), the desktop shell's `port`, the boot file's
        fallback, the e2e driver, the guard's APP_PORTS, AGENTS.md, README and the help's troubleshooting
        page.
GO:     the user, verbatim: "your rec on all just think on it again go" (2026-10-18).

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
