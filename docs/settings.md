# App Settings

**App Settings** in the sidebar holds the app's own settings (**General**, **Advanced**) and the sections
every family app has: **Appearance**, **Backups**, **Storage**, **Server**, **Logs**, **Updates** and
**About**, as tabs across the top of the page.

## General

The numbers and switches the app works with, in five cards. Change one or several, then press **Save**
at the bottom (or Enter in a box). A number outside what a box allows stays in the box with what's
wrong under it. There is no button that takes one setting back to its default: type the default
given here, or use [Reset Just House Paint](#reset-just-house-paint), which resets everything.

**Photos** — the copies made when a photo is added. A change applies to the photos you add afterwards;
the houses already here keep their copies.

- **Screen copy, longest side (px)** — 2048 at first (512–4096): the copy the house page paints on.
- **Card copy, longest side (px)** — 480 at first (128–1024): the picture on its card in **Your houses**.
- **JPEG quality** — 88 at first (50–100): how those two copies are saved. Your original photo is kept
  as it is, and **Save image** doesn't use this.
- **Largest photo (MB)** — 40 at first (1–200): a bigger file is refused — "Photo too large".
- **Save image and the AI photo, at most (megapixels)** — 16 at first (1–200): **Save image** and the
  AI photo work on your photo at most this big; a bigger photo is scaled down to it, the same shape.

**Designs and paint files**

- **Designs per house** — 30 at first (1–200). Past it, **Save as a new design** says "This house has
  all the designs it can keep" — delete one first, or raise the number here.
- **Largest palette file (MB)** — 30 at first (1–200): a bigger file to import is refused — "File too
  large".

**Part finder** — see [Finding the parts](finding-parts.md).

- **Use the graphics card (Windows)** — on at first. On Windows the finder's heaviest step runs on the
  graphics card; off, everything runs on the processor (slower). On macOS and Linux it always runs on
  the processor. A change takes effect the next time the finder loads (after it let go of its memory,
  or at the next start).
- **Let go after (minutes idle)** — 10 at first (1–240): after this long with nothing to do, the finder
  frees its memory; it loads again when it is next needed, which takes a little longer.
- **Parts reach past the house by (share of the photo)** — 0.02 at first (0–0.2): how far past the
  house's own outline a part may reach, as a share of the photo's longer side; what lies further out
  is cut off. 0 turns this limit off, and the next setting with it.
- **A piece counts when this share of it is on the house** — 0.5 at first (0–1): a piece the finder
  found (a door, a window) counts only when this much of it lies on the house, its margin included —
  so a car parked in front isn't taken for a door.

These two work only when the finder recognizes your house in the photo. Each part's own share on the
house (**onHouse**, under [Advanced](#advanced)) holds whatever they are.

**AI photo** — see [The AI photo](ai-photo.md).

- **Working size (pixels)** — 786,432 at first (1024 × 768 for a 4:3 photo; 65,536–1,920,000): the size
  the AI draws at. Bigger is sharper and slower and needs more graphics memory; lower it if the AI
  photo fails on "out of memory".
- **Name other programs holding more of the graphics card than (MB)** — 1024 at first: when other
  programs held more than this of the graphics card as an AI photo started, the picture names them
  under its time. 0 never does. Only programs holding 200 MB or more are counted, and only where the
  app can measure it: on Windows, and on Linux with an NVIDIA card.

**Other windows**

- **Look for other windows' changes every (seconds)** — 3 at first (1–60): how often a window open
  somewhere else (a browser, another computer, a phone) looks for what the others changed. It shows
  their changes by itself.

## Advanced

The structured settings, each as JSON in its own box with its own **Save**. The app's server checks
each one when you save it: text that isn't JSON is refused ("This isn't JSON: …"), and a value it
doesn't allow is named under the box.

- **What the part finder looks for** — one entry per part:
  - **key** — the part's name inside the app (`trim`, `frontDoor`); **labelKey** — the name it shows. A
    part with a key the app doesn't know shows its key in words ("side door").
  - **prompts** — the words the finder looks for (up to six).
  - **threshold** — how sure the finder must be, between 0 and 1: lower finds more, and more wrongly.
  - **paintable** — false for what stays as it is (it is listed under **Staying as they are**).
  - **group** — the family it belongs to (walls, trim, doors…).
  - **method** — `"subtract"` for the body only: the house the finder sees, minus every other part.
  - **minus** — parts taken out of this one: window trim is each window minus its glass.
  - **onHouse** — how much of each piece must lie on the house itself, between 0 and 1: a fence's end
    board or a garden statue doesn't.
- **Which part keeps a pixel two parts claim** — part keys, first wins: the garage door before the door,
  the gutters before the trim.
- **Which parts each scheme color paints** — for **body**, **trim** and **accent** (the door color), the
  part keys each paints when you **Apply** a scheme. The chimney is in none of them.
- **The harmony rules** — the numbers the schemes are built and checked with (lightness and chroma
  are OKLCH's, 0 to 1 and about 0 to 0.4):
  - **kinds** — which harmony schemes are made.
  - **exteriorOnly** and **includeArchived** — schemes use only paints not marked for inside use, and
    never discontinued ones.
  - The **trim…** values — how far the trim's lightness sits from the body's, and how gray it stays.
  - The **accent…** values — how colorful the door must be, and how far from the body (ΔE).
  - **complementaryAngle**, **analogousAngle**, **triadicAngle** — the hue steps, in degrees.
  - **mono…** — the lightness steps of **One color, three shades**.
  - **classic…** — Classic's body lightness range, its trim and door, and the door colors it picks
    from (brick red, navy, forest green).
  - **achromaticChroma** — below it a paint counts as gray (no hue).
  - **coordinatingMaxSchemes** — how many of a brand's own pairings are shown.
- **How colors are ordered by color** — **grayChroma**: below this chroma a color is a near-gray,
  listed first; **bandDegrees**: the hue bands the rest are listed in; **families**: the **Color
  family** choices, each from its hue to the next one's.
- **The AI photo's prompts** — the words the image model reads: **single** for one part, **multi**
  with one **item** per part (joined by **separator**), and the color as **colorNamed** or
  **colorUnnamed**. `{surface}`, `{color}`, `{list}`, `{name}` and `{hex}` are filled in.
- **How the AI photo is put back on the photo** — **featherPx**: how soft the edge of the pasted-back
  photo is; **insideAt**, **basePercentile** and **litBand**: which pixels count as a part's normally
  lit wall (its ΔE is measured on them); **lockOnlyRepainted** and **repaintedRange**: only what the AI
  repainted is locked to the paint color; **sameColorDeltaE**: below this difference from the old
  color the whole part is locked; **gainLimits**: the most the light from **On it now** may change it.

A setting you never changed takes a new version's better default when the app starts. One you edited
keeps your edit — so an edited **What the part finder looks for**, **Which part keeps a pixel two parts
claim** or **Which parts each scheme color paints** doesn't get the parts a new version adds
(Decorations, for instance, and the door casings in Trim).

## Appearance

How the app looks: applied at once and kept by the app, the same in every window.

- **Theme** — **Light**, **Dark** or **Follow system**. The button at the right of the title bar
  switches it too.
- **Interface size** — **Compact**, **Snug**, **Normal**, **Comfortable** or **Large**: labels,
  controls and panels together.
- **UI font** — the typeface of the interface.
- **Accent hue** — drag the slider to pick the color of the app's buttons and highlights (166°, a green,
  at first). It has nothing to do with a color scheme's accent, the door color.
- **Language** — the app's language (English for now).

## Backups

**Export backup…** saves everything in one file (`just-house-paint-backup-<date>.zip`): your houses with
their photos, outlines and AI photos, the designs, the paint colors, the settings and your AI setup —
the AI providers' keys too. Keep the file as you would a password. Not in it: the access tokens, and
the downloaded engines and models (they download again). In the desktop app the file is written
straight to where you save it; a browser downloads it whole first. While it is made, the file is put
together beside the app's data, so that drive needs room for it. A backup can be made while you or
another window keep working.

**Import backup…** restores one — "Restore from backup?": it replaces all the data with the backup's.
It is all or nothing:

- A file that isn't a backup, a damaged one, or one that won't fit the drive ("the backup unpacks to
  … GB; the drive has … GB free" — it needs its own size and a little more) is refused, and nothing is
  changed or stopped.
- Once it starts replacing the data, the work that was running — finding parts, an AI photo, a
  download — stops, whether or not the restore finishes.
- While it runs, other windows' changes are refused ("A backup is being restored"); then every window
  shows the restored houses.
- If it can't finish, your data is as it was. In the rare case it can't even put your data back while
  it runs, it asks you to restart the app, which puts it back as it starts.

A restore keeps this computer's access tokens and where its AI engine and models are (the engine's
build and the models' folder). Every other setting comes from the backup — the part finder's and the AI
photo's too. A backup from an older version gets this version's new settings at once; a setting in it that doesn't fit this
version is set back to its default, and the app says which. A backup this app can't read — not one of its
backups, cut off, or holding a house, a part or an AI photo whose name it can't keep as a file — is refused, and
nothing is changed.

## Reset Just House Paint

**Reset…** asks "Reset Just House Paint?" and has you type **RESET**. It wipes every house, design,
paint color and setting, and starts again as on the first start — and with them your AI setup: the AI
providers and their keys, the models you added, the presets and routing, edited prompts, the usage
counts, and the app's remembered choices (the theme, the outlines, the once-ever AI offer, which then
asks again). It keeps the access tokens, where the data folder is, the installed engines and the AI
models' files. The brands' colors load again from their sites; one you imported from a palette file
has to be imported again. Make a backup before it.

## Storage

**Data location** — where everything the app saves is: your houses and their photos, the AI engine and
downloaded models, and the logs.

- **Folder** — the data folder. **Type** — **Portable — beside the app** (a `data` folder in the app's
  own folder) or **User folder**.
- **Change folder…** — moves all of it to another folder; see
  [Where to keep the data folder](#where-to-keep-the-data-folder). In a browser Storage says "Changing
  the folder is available in the desktop app."
- **Move back to the default folder…** — moves the data back where the app keeps it by default. While
  an old copy is still in the default folder Storage says "To move the data back to the default folder,
  remove the old copy there first."
- When the data folder is set by the `JUST_HOUSE_PAINT_DATA_DIR` variable, Storage says "This data
  folder is set by JUST_HOUSE_PAINT_DATA_DIR — change it there", and **Change folder…** isn't shown.

**Old copy** — after a move, the old folder keeps its copy. Storage lists it with its size and
**Remove the old copy…**, which deletes only what the move copied there — nothing else in that folder,
and never the folder the app uses. Its question names the apps that share this app's AI models (if
they still use the old copy's, they download their models again). If the app ran on the old copy after
the move, Storage says "The old copy was used after the move — last changed …": removing it removes
that work too, so move what you need out of it first. An old copy the app can't find is **Not found**, with
why — its folder isn't there (its drive unplugged, the folder renamed or deleted), or the folder there now isn't
that copy (another drive in its place, a folder copied by hand); one on a drive that didn't answer (a network
folder offline, a drive waking) reads **Didn't answer just now**, with **Try again**. Such a copy is never removed
and the app never drops it by itself: it stays listed until it is found again or you press **Forget…**, which asks
first ("Forget the old copy?" → **Forget it**), then only takes it off the list (nothing on any drive is
touched). A server of the app still running on the old copy has
to be stopped before it can go.

**When the app isn't on your data folder** — when the data's folder couldn't be used at the start
(**Use the default folder** in the start's question), or the app runs on an old copy, Storage says so at the
top, in one sentence: where your data is and, when that folder can't be used, why — fix that and restart, or
**Use the default folder from now on…**, which stops the app looking for that folder (nothing in it is
touched); once that folder can be used again, restart the app to use it. When `JUST_HOUSE_PAINT_DATA_DIR`
names the old copy, change it to the folder Storage names (**Use the default folder from now on…** isn't
offered then). Meanwhile **Change folder…** isn't shown.

**Disk usage** — where the data folder's space goes:

- **Models cache** — the AI models downloaded for **AI Settings**. **Clear…** asks "Clear downloaded
  models?" and frees them; they stay in the catalog and download again the next time they're used.
  When the cache is shared with the family's other apps, the question says clearing it clears their
  models too. When it is a link to a folder elsewhere, **Clear…** removes only the models this app
  downloaded there, never the rest of that folder. While a model is loaded it says "A model is loaded —
  unload it first (AI Settings → Unload), then try again."
- **Engine logs** — what the AI engine wrote while it ran; **Clear…** empties them.
- **Engine builds** — the AI engine's program files.
- **Your houses' photos** — every house's photos, outlines and AI photos.
- **The part finder** and **The AI photo** — their downloaded engine and model. **Remove** frees the
  space: your houses keep the parts already found and your AI photos stay; **Install** (on a house)
  brings it back.
- **Database**, **Server logs**, **Total** and **Free disk space** on the data folder's drive.

## Where to keep the data folder

**The default folder.** On Windows it is a `data` folder in the app's own folder (unless you chose
another, `%LOCALAPPDATA%\Programs\justhousepaint\data`) — an update and an uninstall keep it, so after an
uninstall your houses and the downloaded models are still there until you delete that folder. On a Mac
it is `~/Library/Application Support/JustHousePaint`, on Linux `~/.local/share/JustHousePaint`.

**Change folder…** asks you for a folder, then "Move all app data?" — it copies everything into a new
folder named **Just House Paint** inside the folder you picked (what else is in that folder is never
touched; the question names the new folder), checks the copy, and restarts the app on it (**Move &
restart**). Before it copies it checks the drive has room: "… can't hold the data: the data needs … GB
of room and its drive has … GB free". An access token this window uses comes along. The old folder
keeps its copy (see [Storage](#storage)).

It refuses a folder:

- inside the app's own folder — an update or an uninstall replaces it (the default folder is the one
  exception);
- inside the current data folder;
- whose **Just House Paint** folder already exists and isn't empty;
- whose path would be over 180 characters (some parts of the engines can't open longer ones), or
  whose name ends in a dot or a space.

While the data is being copied the app can't be quit or closed — it says "The data is being moved —
quit when it's done." — and it restarts on the new folder when the copy is done. If the computer stops
midway, the half-made copy is removed at a later start and the data is where it was.

Best on a drive inside the computer:

- A folder synced by OneDrive, Dropbox or another sync service can hold the app's files while they are
  written, and OneDrive's "files on demand" leaves the engines' 11.3 GB of models online-only, so the
  engines fail without the network.
- A network drive or a USB stick works only while it is there.
- A FAT32 USB stick can't hold the AI photo's model (over 4 GB): the move stops and says "a file is
  bigger than its drive can hold".

## Server

The app's server runs inside the desktop app; it can also run on its own — see
[On another computer, or without a window](getting-started.md#on-another-computer-or-without-a-window).

**Headless access** — the command that starts the server on its own (`just-house-paint-server serve`;
where it is: [The command line](getting-started.md#the-command-line)), and the server's address with
**Copy**. Behind a reverse proxy (nginx, Caddy, `tailscale serve`), turn on **Require a token on this
computer too** below, or have the proxy send `X-Forwarded-For` — in nginx,
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` (Caddy sends it by itself). A proxy that
sends no such header looks like this computer, and this computer needs no token.

**Keep server running after the app closes** — closing the window then hides it to the tray and the
server keeps serving; the tray shows the window again or quits for real
([The tray](getting-started.md#the-tray)). A downloaded update then waits for the tray's **Quit**.

**Access tokens** — off by default: "No tokens — anyone who can reach the server can use it (fine when
it's only on this computer)." Type a token in **Paste or generate a token**, or press **Generate** for a
random one, then **Add token**. With a token, every request from another computer needs one. Each token
has **Copy the address with this token** — a browser that opens that address is signed in — and **×**
(**Remove token**): a window signed in with it goes back to asking for a token.
**Require a token on this computer too** asks for one on this computer as well; the window that turns
it on keeps a token, so it goes on working.

## Logs

**Server logs** — what the server and this window reported, newest last. Every failure is written here
under the reference a message shows. Choose **Live tail** or a day (one file per day, kept 30 days, in
the data folder's `logs` folder), and **Lines shown**: **All levels**, **Warnings & errors** or **Errors
only**. **↻ Refresh** reads it again; **Copy** copies what is shown; **Download** saves the live log.
**Clear** empties the live tail on the screen; **Delete day** and **Delete all logs** remove the stored
files (each asks first).

The AI engine's own words aren't here: they are in AI Settings →
[the AI engine console](ai-providers.md#the-ai-engine-console).

## Updates

The installed desktop app looks for a new version when it starts, every six hours, and shortly after
the computer wakes. **Updates** shows the current version and what it found:

- "This is the latest version." — **Check again** looks now.
- "Version … is out." — **Download** fetches it; "Version … is downloaded. It installs when you quit the
  app." — or press **Restart now**: it quits, installs the update and starts again by itself.
- On a Mac: "Version … is out — download it from its release page." — **Open the release page**.
- "Couldn't update: …" — what went wrong; **Check again** tries again.

Below them, What's new. In a browser this section shows only the version and What's new: updates come
through the desktop app.

## About

The app's name and what it is for, its **Version**, the **Desktop runtime** (in the desktop app), the
**Data folder** it uses now, and **Source** — the app's code on GitHub (opens in your browser).
