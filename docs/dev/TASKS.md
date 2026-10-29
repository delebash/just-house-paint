# TASKS — the live open-work tracker (just-house-paint)

> One entry per open item, with a pointer to its detail. **Close = delete** — git and the plan
> docs keep history. Decisions are recorded as the exact text the user approved. A tracker line is
> a claim, not evidence. Facts live in [`RESEARCH.md`](RESEARCH.md).

## Finish house-paint and release it — the go [2026-10-28]
GO:     the user, verbatim: "i would like to finish houspaint fix all bugs add any ideas ect and do a real release";
        then "also like jw this app should have a good readme page with features as well as dev docs and a website
        like jw"; then "go on housepaint" on the order: (1) round B's last real checks, (2) a full bug pass, each fix
        with its test, (3) IDEAS.md for the user's pick, (4) a dry run, then the real release with the user's go.
        The answers of 2026-10-28, verbatim:
        - "House-paint's website …": **"just-house-paint-website (Recommended)"** — "A new public repo,
          delebash/just-house-paint-website, on JustWrite's stack (Astro + Starlight). Pages at
          delebash.github.io/just-house-paint-website. Each release attaches docs.tar.gz and pings the site, as
          JustWrite's does. Its own look, built on paint colors and the app's real screenshots, not JustWrite's book
          design."
        - "House-paint's IDEAS.md has two ideas. Which go into this release?": **"Neither (Recommended)"**.
        - The Gemini probe: **"Park it in IDEAS (Recommended)"** — "Move it to IDEAS.md as unscheduled, so it doesn't
          block the release. The harness is built and ready if you turn billing on later (8 calls, under $0.50)."
STATE:  (1) DONE — round B checked for real (the history's engines entry). (2) DONE — the bug pass: the walk
        on a copy of the real data (30 steps, no app error), the GPU flows through the screens, the kit's arbiter;
        fixed with their tests: the kit's runServerJob (0384b39), the kit's catalog in the built-in provider's Edit
        (2d1065d), Paint colors' "public list" for the palette-file brands and the AI photo's buttons under the fold
        (757a608 — RESEARCH §14). (3) DONE — "Neither (Recommended)"; the Gemini probe parked in IDEAS. The README
        with the features first and docs/dev/ARCHITECTURE.md (9bc2af2); the release carries the user docs and pings
        the website (the template's way, kit e326cb8 + 0976b4e); the website built and live (RESEARCH §14); this
        tracker closed down to what is open (its history: `../plans/archive/tasks-history-2026-10.md`).
        The full cross-app run DONE 2026-10-28 (26 steps green: the kit, the template, every app's tests, the guard,
        this app's unpacked build and e2e 16/16). The GitHub dry run DONE: run 40810813894 on main 1109e3c with the
        kit at bb2b5dd — the three builds started on their runners, the AppImage opened as a user does, nothing
        published (installers 154 / 367 / 162 MB kept on the run).
NO RELEASE YET — the user, verbatim (2026-10-28): "do not recommned a release, i want all bugs fixed all features
        recommended done before we do a release, are theer any features that you would recommned or other
        outstanding items"; then "you can think about any new features that we dont have already or in ideas that you
        would add".
MY RECS (shown 2026-10-28), waiting on the user's pick and go:
        Fixes — 1. the AI photo names the part furthest off ("front door: ΔE 37.8, left as photographed"), not only
        the number (edit.js computes each part's; the render row keeps only the worst); 2. the Schemes tab's brand
        pairings: all three cards' Apply off with one note repeated, cramped — find why first (the readability rule?),
        then offer body and trim with a warning on the door if it is the rule; 3. App Settings → Storage lists the
        folders of deleted houses an older version left (no mark, never swept) with Remove — not an automatic sweep.
        Features — A. the same color in other brands: the nearest paint of each other brand with its ΔE ("very
        close" under 2, the real-chip note); B. use a design on another photo: copy it to another house, the parts that
        house lacks skipped and named; C. the finish per part (flat, satin, semi-gloss…) on the color list and color
        card, recorded, not drawn; D. morning / midday / evening light: a white-balance preview over the whole photo,
        never saved. Order: A, B, then C, then D. From IDEAS: signed installers — SignPath Foundation (free for open
        source, the owner applies); the cloud AI photo and wide-color photos stay parked.
GO:     the user, verbatim (2026-10-28): "do 1-4, leave ideas as is, fix the bugs, …" (1–4: the four features; the
        bugs: fixes 1–3); "you have the other points correct, and you have a go"; "do the fixes do it all dont do a
        releaswe until we have all features and all bugs fixed".
DONE:   fix 1 — the AI photo names the part furthest off (4e15864); fix 2 — the brand's pairings apply, the rules'
        findings a note (48a7bae); fix 3 — Storage lists the photos of houses not in the app, Remove after asking
        (e165a2f); A — the same color in other brands (ec0aa9a); B — use a design on another house (fe3163b); C — each
        part's finish on the color list and card (c808927); D — Daylight, a white-balance preview (1d8ffc4). The house
        folder fafbf1f1 in the user's data is now listed by fix 3 (Remove, after asking).
DECIDED (the user, 2026-10-28, verbatim): "i dont ever want an automatic build of anything i only want stuff to build
        when i say so" — the website's push trigger gone (d2e7e03), the family guard's check 25 (kit 0b6ef7c).
        On the website's rebuild: "why are we starting another repository's workflow … why would i run the website
        workflow from the app workflow this doesnt make sense"; "to me we should just have a command like npm run
        deploy for each app website and it runs its own workflow"; "and each app it should all work the same";
        relayed by docgen's session: "dont worry about key … each app website should run its own via something like
        npm run deploy other github workflows shouldnt be running other workflows jw is wrong".
GO:     the user, verbatim (2026-10-29): "your rec go do it stop asking me just think adverserial on your recs and do it
        go". DONE: (a) the website deploys by its own `npm run deploy` (kit abb3975: website/, the template's release
        starts nothing, checks 25 and 26; this app's release and its site on it); (b) the security updates (kit
        96dede9: undici ^8.12.3, Electron 44.10.0; this app f7c6cae). The full run after the seven: green (lint, i18n,
        server 387, unit 195, the guard, the unpacked build, e2e 16/16).
        The website's text and screenshots for the four new features DONE (just-house-paint-website a32a084, 8e43722);
        the Colors tab's polish found there (7c6ac22). The full cross-app run after it all: 26 steps green (kit core
        1526, kit ui 75, template 62/108, this app 387/195 and e2e 16/16, JustWrite 195/786, JustVoice 1384/261,
        docgen 188/21, the guard).
        The site deployed by its `npm run deploy` (the user: "you can publish it yourself"; run 40818805366).
GO:     the user, verbatim (2026-10-29): "go" — on the AI photo's close-up for a small part the model left as
        photographed. DONE (debc6ee): the front door 37.77 → 0.57 on the website's house (RESEARCH §14).
GO:     the user, verbatim (2026-10-29): "go ndo it all stop asking me stop stoping" — on what was left: the white
        patches in the AI photo, a fresh dry run, the release. The patches: SAM 3's outline stopping short of what
        stands in front, kept for the release — the Brush fills it, the docs say so, edge refinement an IDEA
        (RESEARCH §14).
PAUSED: the release — the user, in JustWrite's session (2026-10-29): "why whould we release house paint if we are still
        doing kit work, wouldnt that mean houspaint gets old kit?" A release builds with the kit's commit of that moment,
        so the kit's q-inner-loading fix (a pale wash in dark mode on Home, Colors and House) lands first (the kit's
        TASKS, JustWrite's asks 3).
        Then the family rule, the user verbatim (2026-10-29, relayed by JustWrite's session): "i want all kit work done
        for all apps before we release any app, i want to relase all apps that we are working on now but not until all
        kit work is done by each app that means each app is complete bugs fixed featrues done all tasks ideas done or
        removed from list" — house-paint releases with the others (the kit's TASKS, "The family releases together").
OPEN:   - the release, with the family; the dry run 40823762045 green (6879a42, the kit at ddb1431; publish skipped).
        - the website's deploy after the release (its close-up pictures and words, fef4d64).
        - the accessibility check's first run, in the final pass: e2e/tests/a11y.test.js, the template's (kit 3b373d6 —
          the family's WCAG 2.2 AA, app-structure §17/§18, the kit's "Finish the kit" 36) with this app's four nav
          pages and a house's four tabs, light and dark; written, not yet run (the user: e2e once, at the end). What it
          finds is fixed before the release.
DECIDED (the user, 2026-10-29, verbatim): "no signed installers not worth it"; then, on the rest, "yuour rec go".
        DONE: IDEAS.md emptied; the PRD's "Out of scope" names each one as decided, not later (fc413aa).
        The phone app — my rec removed it, but the user said on 2026-10-17 (the history, verbatim): "als we prob will
        wont a mobile app later which quasar has functiosn for as well". My rec then: keep it as "later" (the PRD's
        one later line; src-capacitor stays as Quasar generates it; not release work). The user, verbatim: "your rec
        go".
DECIDED (the user, 2026-10-29, in JustWrite's session, relayed by the kit's — kit TASKS, 5ff893d): "i dont want tests
        just running or things just running on commit in gituhb unless we need it often", then "remove hook your rec
        on rest" — no commit hooks, family-wide. Here, the user: "go". DONE: .husky/, `prepare`, the lint-staged block
        and both packages gone; AGENTS.md and README say the checks are run by hand.
MY RECS (shown 2026-10-29, the family's item 5): IDEAS and the PRD's "Out of scope for v1".
        Do: signed installers — Windows through the SignPath Foundation (free for open source; the owner applies; the
        signing step in the template's release.yml, every app copies it; not holding the release for it); macOS's paid
        Developer ID left out. Remove: the outlines reaching what stands in front (the Brush fills it — RESEARCH §14);
        the cloud AI photo (needs billing to test, sends the photo out; re-add with billing); wide-color photos
        (measured not worth it); live camera/AR; paint quantity and cost (a photo can't measure the house; the brands
        have calculators); ordering samples; interior rooms; sharing designs online; the phone app; HEIC (an HEVC
        decoder's patents — why sharp's builds leave it out; the app says how to send a JPEG).
