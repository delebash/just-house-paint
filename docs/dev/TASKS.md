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
OPEN:   - the full cross-app run (the kit, the template and every app), then (4): a GitHub dry run, then the real
          release with the user's go.
        - for the user, not code: the secret WEBSITE_DISPATCH_TOKEN on this repo (a token that can start the
          website's workflow — I can't make one); without it the release's notify-website says so and passes, and
          `gh workflow run deploy.yml -R delebash/just-house-paint-website` rebuilds the site.
        - for the user, not code: the real data folder holds one house folder with no row (houses/fafbf1f1…, 1.8 MB,
          the user's own photo — a delete a dev build's Windows hold stopped on 2026-10-19, before 9987314 marked such
          folders); the start-up sweep takes only marked folders, by design (a restore's photos). Delete it by hand
          when the app is closed.
