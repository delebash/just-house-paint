# IDEAS — the backlog

The one place to drop ideas for this app that aren't scheduled work (app-structure §13). Not a
plan, not a spec — a holding pen so nothing good gets lost. Committed work lives in `TASKS.md`;
when an idea is picked up it moves to a plan and gets a link here (or is struck through).

- Keep entries short: the itch, the rough shape, why it matters.
- Newest at the top. Date each one.
- Anyone (user or agent) can add here; adding an idea is never starting it.

---

- **Say what else holds the graphics card** (2026-10-19). The AI photo takes ~20 s on a free 8 GB card and
  longer when another program's model sits on it (RESEARCH §12). The kit already lists the processes
  holding GPU memory (`_otherGpuHolders`, for the warm start's error); the AI photo dialog could say
  "Another program is using the graphics card (llama-server, 6.9 GB) — this will take longer."
- **Signed installers** (2026-10-19). v0.1.0 ships unsigned: Windows shows SmartScreen's "unknown
  publisher", macOS Gatekeeper's warning (the help says how to open it). Signing needs a certificate in
  the user's name: the SignPath Foundation signs open-source projects' Windows builds for free (an
  application by the project's owner); Azure Trusted Signing is a paid monthly service; macOS needs an
  Apple Developer ID ($99/year) plus notarization. electron-builder takes either through the release
  workflow's secrets.
- **Wide-color photos** (2026-10-18, TASKS "Wide-color photos"). A Display P3 pipeline (the display copy
  in P3, canvases in display-p3, the painter in linear P3, exports tagged P3) and a native P3 canvas
  under Konva. Measured not worth it today (RESEARCH §11, "The gamut diagnosis above was wrong"): the
  brands' paints are sRGB colors, so a painted part looks the same; only ~0.2% of the user's photo lies
  outside sRGB, and only a wide-gamut screen would show the difference.
