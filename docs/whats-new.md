# What's new

## v0.1.3

- **On a Mac, coming from v0.1.2: save your data before you replace the app.** v0.1.2 kept your houses
  inside the app (`Just House Paint.app/Contents/MacOS/data`), and replacing the app removes them. Before
  you replace it, make a backup (**App Settings → Backups → Export backup**) and restore it in the new
  version — a backup doesn't hold the part finder and the AI photo: install them again. Or keep everything, the
  engines too: quit the app, Control-click it, choose **Show Package Contents**, open `Contents/MacOS`,
  and move the `data` folder into `Library/Application Support` (in Finder, **Go → Go to Folder…** and type
  `~/Library/Application Support`), then rename it `JustHousePaint` — if a `JustHousePaint` folder is
  already there (the new version was opened first), quit the app and put yours in its place. From this
  version on, your data stays outside the app.
- **Behind a reverse proxy, or under another name for your computer** (Caddy, nginx, `tailscale serve`):
  name its address in `JUST_HOUSE_PAINT_ALLOWED_HOSTS`, or the server refuses it; keep an access token on, and
  turn on **Require a token on this computer too** or have the proxy send `X-Forwarded-For` (Caddy does) — see
  [On another computer, or without a window](getting-started.md#on-another-computer-or-without-a-window).
- **Several windows at once** — the desktop app, a browser on another computer, a phone: what one
  saves shows in the others within seconds (**App Settings → General → Other windows**), two painting
  different parts of one design keep both, and a stroke, a Box or a part added on outlines another window
  has just changed is refused and the house shown as it is now — never one window's work saved over the
  other's.
- **Restoring a backup is all or nothing**: if it can't finish — a file in the app's data open in another
  program, say — it says so and your data is as it was; in the rare case it can't even put your data back while
  it runs, it asks you to restart the app, which puts it back as it starts. Once it starts replacing the data,
  work that was running (finding parts, an AI photo, a download) stops. While it runs, other windows' changes are
  refused; then they show the restored houses. **A backup** can be made while you or another window keep working.
- **Left open for days**: a window that is minimized or hidden stops looking for other windows' changes and asks
  the server only about work it is waiting for (a part search, an AI photo, a download) — **AI Settings**, while
  it's open, still watches its engine; the app checks for updates every 6 hours and when the computer wakes; the
  server started again (the tray's **Restart server**) no longer refuses your next stroke; a part search or an AI
  photo survives a moment without the network, and one that ended while the computer slept says how it ended when
  it wakes — its result, or "This work ended while the app wasn't looking" (start it again); a token removed in
  **App Settings → Server** brings the window to the token page.
- **On a small screen** the window never opens taller or wider than its screen.
- **Change folder…** (**App Settings → Storage**) copies the data into a new folder for the app inside the one you
  pick, checks the copy and only then switches — your old folder is left whole. Storage shows the old copy and its
  size, with **Remove the old copy** (it says so first if the old copy was used after the move); an old copy it
  can't find is **Not found**, with **Forget**. Quitting and closing the window are held while the data copies (it
  says so), and the app restarts on the new folder; a folder inside the app's own folder, which an update replaces,
  is refused; **Move back to the default folder** returns it; an access token you use on this computer comes along.
  When `JUST_HOUSE_PAINT_DATA_DIR` names the folder, Storage says to change it there. See
  [Storage](settings.md#storage).
- **On more computers**: the part finder and the AI photo say what a computer lacks before anything downloads —
  Microsoft's Visual C++ runtime (with its link), macOS 26 or a newer Linux for the AI photo, room on the drive,
  enough memory — and an engine an antivirus damaged says so instead of failing; a data folder on a USB stick or
  a network drive that isn't there is said at start, with **Use the default folder** for that time only (and
  **Use the default folder from now on** in **App Settings → Storage**); behind most company
  networks' proxies and certificates, downloads and brand lists work (the desktop app passes the system's proxy on;
  a server started on its own takes `HTTPS_PROXY`); two people signed in to one computer no longer stop each other's
  app (still, one of them at a time has it open); the photo stays sharp moved to another screen; a pen or a finger
  draws one stroke at a time; a comma works as the decimal point in a box that takes fractions; paint search
  ignores accents; a saved picture's file name never holds characters Windows refuses.
- **Easier to read and use**: the house cards in the dark theme, a switch that is off, the Parts tab's
  paint names, the Colors tab's swatches; **Remove the color**; a scheme that can't be made from a
  gray says why; the house page fits half a 1920 px screen with nothing to scroll; tabs that don't fit
  scroll with arrows instead of taking a second row; a part with no color shows a **No color** swatch.
- **Nothing unsaved goes by accident**: closing the window, a reload or Quit with colors that aren't saved in a
  design asks first.
- **A dark wall painted light looks freshly painted.** Stained wood or a dark paint painted much
  lighter no longer shows the old finish's blotches and grain; the lines between the boards and the
  shadows stay. With **On it now** set, the app goes by that paint to tell a dark finish from a light
  one.
- **Decorations**: the finder finds the medallions and other ornaments on the walls as their
  own part — a garden statue in front isn't one. A scheme paints them the trim's color.
- **Trim** now takes the casings around the front door and the garage door, and no longer a fence's
  end board beside the house.
- **Only your house is painted**: the finder no longer finds windows, doors, soffits and trim on a
  neighbor's house in the photo, when it recognizes yours.
- **The AI photo says when other programs slowed it**: under its time, the programs that held the
  graphics card when it started, and how much (on Windows, and on Linux with an NVIDIA card).
- **Linux**: the AppImage opens on Ubuntu 24.04 with nothing to install — before, it asked for FUSE, and its
  server didn't start.
- **The part finder's card says when it can't run** on the computer, before anything is downloaded.
- **Deleting a house** right after finding its parts no longer stops halfway.
- **Clearer at every step**: the parts stay listed when the part finder is removed; a search that
  finds nothing says so; on the first start the Colors and Schemes tabs say the brands are loading
  and pick one as it lands; a design name the house already has is shown under the name; an iPhone's
  HEIC photo gets words that say what to do; a failed AI photo, download or search says which; an imported palette
  file says how many colors came in and what it left out; a house's card shows when anything of it last changed —
  its parts, outlines, designs or AI photos.
- **By keyboard**: a ring shows where you are; the paint colors are one stop for Tab (the arrow
  keys move between them); the arrow keys move a zoomed photo; with **Box** or **Pick a color** chosen they
  move a crosshair on the photo and **Enter** sets a box's corners or reads the color; the arrow keys pick in
  a row of choices (**Tool**, **Outlines**); **Tab** closes a menu; the help's text scrolls with the keys;
  what is selected is said to a screen reader, and so are messages and finished work; every field and icon
  button has its name; why **AI photo** is off shows beside it; the outlines and the brush show on a white
  house too; hints and muted text are easier to read.
- **A box with two clicks** — one corner, then the other — as well as a drag; once the photo is zoomed, arrow
  buttons beside **+**, **−** and **Fit** move it.
- **Easier to see**: in the dark theme, the text on buttons and on warnings; the edges of fields; which choice is
  chosen in a row of choices (**The new color | On it now**); slow-computer notes as warnings, not errors; a long
  path wraps in messages and in Storage; the Compare slider has its label (**Line**); the side panel opens each tab
  at its top.
- **Number boxes** in App Settings take what you type as you type it — ".7", "15.", "1 500", a comma as the decimal
  point — and a number that isn't allowed stays in the box with what's wrong, never erased; a slider's box keeps to
  the slider's range.
- **Safer on your network**: a web page open in your browser can't read or change the app's server
  any more; a backup no longer holds the access tokens, and a restore keeps this computer's own (and
  where its AI engine and models are). See [On another computer, or without a window](getting-started.md#on-another-computer-or-without-a-window)
  and [Backups](settings.md#backups).
- **The server on its own on macOS and Linux** too, and **Copy** works in a browser on another computer.
- **The window's smallest size is 960 × 700** — half a 1920 px screen wide; snapped to that half of the screen,
  the house page fits with nothing to scroll (at 800 × 600, the old smallest size, the photo was a thumbnail).
- **Your data stays outside the app on macOS and Linux**: on a Mac in Library/Application Support
  (never inside the app, which an update replaces — coming from v0.1.2, see the first point above), and the
  AppImage and its server on its own share one folder. **Require a token on this computer too** no longer leaves the window unable to do anything.
- A backup restored from an older version gets this one's settings at once (a setting that doesn't fit this version
  is set back to its default, and named), and a restored house's
  first **Find the parts** or **AI photo** no longer fails.
- **Quicker with big photos**: **Texture** applies when you let go (about four times faster);
  **Save image** works in the background — the window stays responsive — and saves at most 16 megapixels,
  as the AI photo works (**App Settings → General → Photos**); in the desktop app a backup goes straight to its
  file however many photos it holds.
- A page opened or reloaded while the parts are found or an AI photo is drawn follows that work; a brand
  reloaded or removed takes its colors with it; a photo with transparency shows white there everywhere; a
  photo too big for the app says which limit it passed.
- A house whose parts were found before keeps them: **Find the parts again** (with **Keep the parts
  you changed by hand** ticked) gives it the new ones — a box marks only the part it gives to as changed by hand.
  A part you changed by hand stays as you drew it — if that is **Trim**, the door casings go with the walls:
  untick **Keep**, or add them to Trim with a **Box**.
- **Clearer refusals**: a palette file with no usable color, a token, a model's repository and every other refusal
  say what was wrong (no more "Request body failed validation"); a palette's swatches that can't be read are counted
  by why ("400 swatches skipped — CMYK needs a color profile"); a restore too big for the drive says so; the window
  that restores or resets says **Restored**, not "replaced in another window"; **Find the parts again** while the
  part finder installs, or where it can't run, says which.
- **Truer paint**: **On it now** with a strong or dark paint (a red door, navy shutters) no longer tints every new
  color — it reads the brightness from it, and the tint only from a light, soft paint; **Save image** no longer
  draws a thin line of the old color where two painted parts meet; a lower **Texture** keeps the wall the chip's
  color; a color click paints only the part it changes (about five times faster on a big photo). **Cancel** on
  **Suggest schemes** stops the AI model too, and an answer given as a bare list is read.
- **Names as they show**: characters that show nothing (a zero-width space, a soft hyphen) never make a second
  "Blue", and a name of only those is refused; a TAB pasted into a name or the color search is a space.
- **Help for every screen**: each App Settings section ([App Settings](settings.md)), AI Settings, the tray, the
  server's command line, and the messages you may meet ([Troubleshooting](troubleshooting.md)).

## v0.1.2

- **Updating is one click.** **Restart now** in **App Settings → Updates** installs the new version
  and starts the app again by itself — before, it opened the setup wizard. (Updating from v0.1.0 or
  v0.1.1 still shows the wizard this once: press **Next**, then **Install**, then **Finish**.)

## v0.1.1

- **A browser on another computer can sign in.** With access tokens on (**App Settings → Server**),
  a browser that has no token is now asked for one — it used to say the server couldn't be reached
  — and **Copy the address with this token** gives an address that signs a browser in by itself.
- **When the AI model doesn't load at start**, **What can I do?** under its bar opens the
  troubleshooting help.
- Installed copies of v0.1.0 update themselves to this one (**App Settings → Updates**).

## v0.1.0

The first release: installers for Windows, macOS and Linux (see Getting started for opening an
installer that isn't signed yet), and updates from **App Settings → Updates** from now on.

- **Your houses**: add photos of your house, rename and delete them.
- **The part finder** (Meta's SAM 3, on your computer): finds the body, trim, doors, shutters and
  the rest; fix its outlines with the brush, the eraser or a box. **Find the parts again** can keep
  the parts you changed by hand.
- **Painting**: real brand paints on your photo with its own light and shadow, each part's ΔE to
  the chip, texture, and the painted photo saved at full size.
- **Undo and Redo** (Ctrl+Z, Ctrl+Y) for colors and outline fixes; **Reset** removes every color
  or goes back to the open design's.
- **Compare** the colors on screen with the photo as taken or with another design, across a line or
  **side by side**; **Outlines** for the selected part, every part or none; zoom buttons.
- **On this wall**: the chosen paint as it shows on the part in shade, on most of it and in light;
  **Light** for a brighter or duller day.
- **On it now**: tell the app the paint a part has today, and new colors show in the photo's real
  light and tint.
- **Pick a color** off the photo, and each part's color as photographed, to find the nearest paints.
- **Order by color**: the Colors tab lists a brand's colors as a paint store's color wall, light to
  dark in each hue, or by name; **Color family** shows only the neutrals or one hue family.
- **A color card**: the painted photo and its paints in one picture.
- **Soffits**: the finder looks for the soffits and fascia under the roof's edge.
- **Window trim**: the frame, casing and sill around each window, its own part to paint; Windows is the glass.
- **Progress you can see**: finding the parts, the AI photo, the AI's schemes, an install and a brand's
  colors loading each show their progress where you started them, with Cancel — and in a stack at the
  bottom right if you leave that screen while they run.
- **Paint colors**: seven brands' colors load by themselves — Sherwin-Williams, Behr, Benjamin
  Moore, Valspar, PPG / Glidden, HGTV Home and Dutch Boy (each can be turned off) — or import a
  brand's palette file. When a brand's new list drops colors your designs use, the app names those
  designs.
- **Color schemes**: harmony schemes around a paint, the brand's coordinating colors, and schemes
  from the AI that suit what stays on your house.
- **Designs**: save the colors on a house, open them again.
- **The AI photo**: a new picture of your house in your colors, drawn on your computer.
- **App Settings → Storage**: how much space your houses' photos, the part finder and the AI photo take;
  **Remove** frees an engine, and Install brings it back.
