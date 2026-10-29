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
OPEN:   - the website's text and screenshots for the four new features, then `npm run deploy` (the site's).
        - the release only on the user's word.
