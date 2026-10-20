# Troubleshooting

Each entry starts with the words the app shows. A message that says **Settings → …** means **App Settings**
in the sidebar; **AI Settings → …** is the AI Settings page. A message with a reference: see
[Logs](#logs).

## Starting and connecting

**"Can't reach the Just House Paint server".** The app's server isn't running, or its port (17499) is taken —
the screen says which when it knows, and it keeps trying by itself:

- **"Another program is using port 17499"** — close that program, then press **Retry**.
- **"Another person signed in to this computer has the app open"** — one copy runs at a time on a computer: they
  quit theirs (its tray icon, **Quit Just House Paint**), then press **Retry**.
- **"Windows has reserved port 17499"** (Hyper-V, WSL or Docker reserve ranges of ports at start) — restarting
  the computer usually frees it. `netsh int ipv4 show excludedportrange protocol=tcp` lists the reserved
  ranges. To keep the port free for the app, open a Command Prompt as administrator and run `net stop winnat`,
  then `netsh int ipv4 add excludedportrange protocol=tcp startport=17499 numberofports=1 store=persistent`,
  then `net start winnat`, and restart the computer.
- **"Its server stopped as it started"** — the words after it say why; **Open log file** in the tray shows the
  rest.

The desktop app starts the server itself: the tray's **Restart server** starts it again and **Open log file**
shows why it stopped. A server stopped with the tray's **Stop server** stays stopped — the window shows this page,
and **Retry** doesn't start it: press **Start server** in the tray. Started on its own, the command is
`just-house-paint-server serve` — where it is on each system:
[On another computer, or without a window](getting-started.md#on-another-computer-or-without-a-window)
(`npm run server` from a source checkout). The app won't open without its server: there is no offline mode to
lose work in.

**"Just House Paint needs an access token".** The server has access tokens on (**App Settings → Server** on the
computer it runs on) and this browser has none, or a wrong one. Paste one of those tokens and press **Connect** —
or open the address **Copy the address with this token** gives. The browser keeps it (where it can't store it — a
private window, blocked site data — only while the page is open). The desktop app on the server's own computer asks only when **Require a token on
this computer too** is on and its window has none (the window that turns it on keeps one).

**"That token isn't accepted".** The token was mistyped or removed in **App Settings → Server** — copy it again
from there. Behind a reverse proxy, or when you open the app under a name this computer doesn't answer to, no
token is accepted until that name is in `JUST_HOUSE_PAINT_ALLOWED_HOSTS` and the server is started again — see
[On another computer, or without a window](getting-started.md#on-another-computer-or-without-a-window).

**"Another Just House Paint server is using this data folder".** One server per data folder. Quit the other copy
— the desktop app with the tray's **Quit Just House Paint**; a server started on its own has no tray: press
Ctrl+C in its terminal. Or give the second one its own `--data-dir` (a folder that already exists — one that
isn't there is refused, never made). The desktop app is the exception: opening it stops a server you started on
its own on its usual port (17499) and takes over — what that server was doing stops. One started with another `--port`
isn't stopped: 10 to 15 seconds later the desktop app says another server is using this data folder. If another
server takes over the desktop app's folder while it runs, the window reloads and says so.

**"The data folder … can't be used".** The folder the app keeps its data in isn't there (a USB drive unplugged,
a network folder offline, the folder renamed) or can't be written — the words after it say which. Plug it back
in and press **Try again**. **Use the default folder** opens the app on its default folder this time only —
your data stays where it is, and the app asks again at its next start. If that folder is gone for good,
**App Settings → Storage → Use the default folder from now on…** stops the question (nothing in the old folder
is touched). When the `JUST_HOUSE_PAINT_DATA_DIR` variable names the folder, that button isn't there: change or
remove the variable instead.

**Windows blocks the app ("Smart App Control blocked …").** Smart App Control runs only signed programs, and
the app isn't signed yet — see [Installing it](getting-started.md#installing-it).

## Several windows at once

**"This house was changed in another window".** The app is open somewhere else too (another window, a browser,
a phone) and the house's outlines changed there — a stroke, a Box, a part added, the parts found — just before
your stroke, Box, part or **Find the parts**. Yours wasn't saved; the house now shows them as they are — do it
again. **"The house is being read again"** means this window is fetching another window's change: draw again in
a moment. **"The parts are being found"** means another window is finding this house's parts: wait for it to
finish.

**"The parts are already being found".** Another window started finding this house's parts, with its own
choice about **Keep the parts you changed by hand**. Wait for it, or cancel it on its progress, then press
**Find the parts** again.

**"This house isn't here any more"** or **"This design isn't here any more".** It was deleted in another window
(or by a reset). The house's designs are shown as they are now; a deleted house shows the way back to **Your
houses**.

**"A backup is being restored"** or **"The app is being reset".** Another window is restoring or resetting the
app; your change wasn't saved. When it is done every window shows the data as it is then — do it again.

**"This work ended while the app wasn't looking, without finishing. Start it again."** A part search or an AI
photo stopped with an error while this window wasn't watching — the computer asleep, the window closed. Start it
again. **"This work was cancelled while the app wasn't looking."** — it was cancelled, in
another window say. **"The app's server started again, and this work stopped. Start it again."** — the server
was restarted (the tray's **Restart server**) while the work ran, and that stops it: start it again.

## Houses and photos

**"Not a photo".** The app reads JPEG, PNG and WebP. For an iPhone's HEIC photo, send or save it as JPEG, or set
the iPhone to take JPEGs (**Settings → Camera → Formats → Most Compatible**).

**"Photo too large".** The photo is bigger than **Largest photo (MB)** in **App Settings → General → Photos**
(40 MB at first) — raise it, or save the photo smaller. One with more than 268 million pixels is refused
whatever the setting ("the most is 268 million — scale it down first").

**"This house has all the designs it can keep".** A house keeps **Designs per house** designs (30 at first):
delete one on the **Designs** tab, or raise the number in **App Settings → General → Designs and paint files**.

**"The image couldn't be painted".** **Save image** didn't finish. Try again; if it keeps failing on a big
photo, lower **Save image and the AI photo, at most (megapixels)** in **App Settings → General → Photos**.

**A part is wrong, or a white board took the body's color.** The part finder missed it — thin trim and fascia
boards are its weak spot. Select the part it belongs to and draw a **Box** around it, or use the **Brush**. See
[Finding the parts](finding-parts.md).

## Finding the parts

**"The part finder can't run on this computer".** Its engine (ONNX Runtime) didn't load here. The words after
it say why; **App Settings → Logs** has the same line. Before the part finder is installed, its card says so
and **Install** is off — nothing is downloaded. Once it is installed, **Find the parts** or a **Box** says so.
Restart the app after fixing what it names.

**"The part finder isn't installed".** It was removed (**App Settings → Storage**, maybe in another window):
install it again on a house's **Parts** tab.

**"The graphics card is busy".** The words after it say what holds it — "an AI photo of … is being drawn", "the
parts of … are being found", or "AI color schemes are being made on this computer's AI model". The app does one
of these at a time (an 8 GB card holds one of their models), on every computer:

- while an **AI photo** is drawn: finding the parts, a **Box**, AI schemes on this computer's AI model and
  another AI photo wait;
- while a house's **parts are found**: a **Box** (on any house), AI schemes on this computer's AI model, an AI
  photo and finding another house's parts wait;
- while **AI schemes** are made on this computer's AI model: only a new AI photo waits.

Schemes from an online provider never wait. Wait for it, or press **Cancel** on its progress.

## Installing the part finder and the AI photo

**The part finder or the AI photo won't install** (**"The part finder didn't install"**, **"The AI photo didn't
install"**). The **AI tasks** panel ([the AI tasks panel](ai-providers.md#the-ai-tasks-panel)) keeps the failed
download with its reason. A cancelled or broken download resumes where it stopped the next time you press
**Install**. A file that doesn't match its checksum is deleted and the install stops — press **Install** again
to download it again.

**"Not enough room on the drive".** "This needs … on the drive of the app's data folder, which has … free". The
part finder needs about 3.4 GB free; the AI photo about 9.5 GB on Windows with an NVIDIA graphics card and about
8.5 GB on most other computers (up to 9.7 GB on Linux with AMD's ROCm). Make room, or move the data folder to a
bigger drive (**App Settings → Storage → Change folder…**, see [Storage](settings.md#storage)).

**"This computer doesn't have Microsoft's Visual C++ runtime (2015–2022)".** The part finder and the AI photo
need it, and say so before anything downloads. Install it from the link it gives (**Microsoft's download**),
then open the house again. **"… older than this engine needs"**: install the latest from the same link and
start the app again — the part finder says this on its card; the AI photo finds it only when it draws ("The AI
photo's engine couldn't start — a DLL on this computer is older than the engine needs"), then try again.

**"A file of the part finder's engine is missing"** or **"Files of the AI photo's engine are gone".** An
antivirus may have quarantined one of the engine's files. Restore it from the antivirus (and allow the app's
folder), or press **Install** again for the AI photo — install the app again for the part finder.

**"The part finder is busy"** or **"The AI photo is busy".** **Remove** in **App Settings → Storage** was
pressed while it was finding the parts, drawing or installing: wait until it has finished, then remove it. **"The part finder is being removed"** /
**"The AI photo is being removed"**: try again when the removal is done.

## The AI photo

**Why AI photo is off.** The reason shows beside the buttons: **AI photo: Find the parts first**, **AI photo:
Give a part a color first**, or **AI photo: No part to paint has an outline yet** — draw one with the brush or a
box.

**"Some colors aren't loaded any more".** A brand was removed, or loaded again without some colors, here or in
another window. Load the brand again (**Paint colors**), or pick other colors for the parts it names.

**"The AI photo's engine couldn't start".** The words after it say why:

- **"a path is too long for the engine"** — move the data folder to a shorter path (**App Settings → Storage →
  Change folder…**; the app's folder in it can be at most 180 characters).
- **"a DLL it needs couldn't be found"** — an antivirus may have removed one of its files: press **Install**
  again; if it still fails, install Microsoft's Visual C++ runtime from the link it gives.
- **"files of the AI photo's engine are missing"** (or **"The AI photo's engine is missing files"**) — press
  **Install** again (and allow the app's folder in the antivirus).
- **"Microsoft's Visual C++ runtime … isn't on this computer"** or **"… is older than the engine needs"** — see
  the Visual C++ entry above.

**When you install, the card warns it will be slow.** **"… on this computer's graphics card one AI photo may
take several minutes"**: only an NVIDIA card on Windows runs the fast build (about 20 seconds); other cards run a
slower one. **"This computer has no graphics card the AI photo can use"**: about ten minutes a picture.
**"This computer has … GB of memory, and one AI photo takes about … GB: here it may be very slow, or not
finish"**: you can still install it; close other programs before you draw.

**"The AI photo didn't finish"** — with "out of memory", or "sd-cli failed (exit …)" and the engine's last
lines. It needs about 8 GB of graphics memory. The app lets go of the part finder and the local AI model first;
close other programs that use the graphics card (games, video editors) and try again. Lower **App Settings →
General → AI photo → Working size (pixels)** if it still fails. The whole story is in **App Settings → Logs**.

**The AI photo is slower some times than others.** It takes about 20 seconds on an 8 GB NVIDIA card on Windows
with nothing else on it. Another program holding the card's memory — another app's AI model, even an idle one —
makes it slower (Windows first moves that program's memory off the card), and one that is working on the card at
the same time slows it more. Close the other AI app, or wait for its model to unload, for the fastest result.
When other programs held more of the card than **Name other programs holding more of the graphics card than
(MB)** (1 GB at first; 0 turns it off) as it started, the AI photo names them under its time, when the picture
first opens — on Windows, and on Linux with an NVIDIA card (elsewhere the app can't see it).

## Paint colors

**A brand's colors won't load ("… colors didn't load").** The brand's website didn't answer, or changed.
**Paint colors** shows the last try's reason on the brand's row (**"The last try failed: …"**); try **Load
again** later, or import the brand's palette file instead ([Paint colors](paint-colors.md)). **"Couldn't load the
brands"**: the page couldn't read the list from the app's server — press **Retry**.

**"Unreadable palette file".** The words after it say why. The app reads Adobe swatch files (.ase, .aco), Excel
(.xlsx) and CSV. A CSV or Excel sheet needs a header row (in its first 20 rows) with a number or name column
(**Code**, **Color Number**, **Number**, **Name**, **Color Name** …) and a color column — **Hex** (or **HTML**),
one **RGB** column ("r,g,b"), or **R**, **G** and **B** (**Red**, **Green**, **Blue**).

**"No colors in the file".** Nothing in it could be read as a color — often every color lacked its number,
which the app keeps each paint by.

**"… colors came in; some of the file was left out".** The import worked; what was left out is listed under it,
counted by why — colors without a number, a number repeated, swatches in CMYK or gray (a paint color is read from
RGB or Lab: "400 swatches skipped — CMYK needs a color profile").

**"File too large".** The file is bigger than **Largest palette file (MB)** (30 MB at first) in **App Settings →
General → Designs and paint files**.

**"No public list".** The brand publishes no list the app can fetch: import its palette file.

**"No paint of this brand near …".** No paint of the brand is near enough to the color you picked — try another
brand, or turn off **Exterior colors only**.

## Schemes and the AI

**"Suggest schemes" fails.** **"AI isn't set up"**: open **AI Settings** and run Quick Setup, or add an online
provider and make it the default ([Set up the AI](ai-providers.md)). **"Find the parts first"**: the house has no
parts yet — the AI reads the house's colors from them. **"No colors for this brand yet"**: load or import the
brand's colors first. The **AI tasks** panel keeps the failed request with its reason; once it's fixed, press
**Suggest schemes** again.

**"The AI's answer couldn't be used".** The AI answered, but not with schemes the app can read (no JSON, or no
scheme with a body, a trim and an accent color). Press **Suggest schemes** again; if it keeps happening, point
the feature at a stronger model ([The AI features](ai-features.md)).

**"The body's paint is …'s — choose … above".** The harmony schemes are built around the body's paint, of the
brand chosen on the **Schemes** tab: choose that brand, or give the body a color of this brand.

**A model won't load.** Its bar on AI Settings shows why. Usually the model needs more memory than the computer
has free — pick a smaller one, or unload another model first. The engine's own words are in **AI Settings → AI
engine console** ([the AI engine console](ai-providers.md#the-ai-engine-console)).

## Backups and reset

**"A file in the app's data is open in another program"** when restoring a backup. Nothing was changed. Close
the program using the app's data folder — an image viewer, a backup or sync tool — and restore again.

**"Not enough room to restore"** or **"the backup unpacks to … GB; the drive has … GB free".** Nothing was
changed. A restore unpacks the backup beside your data first: make room on the data folder's drive (**App
Settings → Storage → Disk usage** shows what can be cleared), or move the data folder to a bigger drive.

**"not a valid backup zip"**, **"backup is missing db.sqlite"** or **"the backup's database is damaged".**
Nothing was changed. The file isn't a backup made with **Export backup…**, or it was damaged — restore another
one.

**"A change is still being saved"** when restoring or resetting. Another window's change was still being saved
after a minute, so nothing was replaced. Try again in a moment.

**"The app needs a restart"** or **"The restore couldn't put your data back".** A restore stopped half-way and a
file held by another program kept the app from putting your data back while it ran. Close the program, then quit
the app and open it again: it puts your data back as it starts.

## The data folder

**"The data folder is already being moved"** or **"The data is being moved — quit when it's done".** A **Change
folder…** is still copying: wait for it to finish (the app restarts on the new folder). Until then the app's
server stays stopped, and the app can't be quit.

**Change folder… refuses the folder you picked.** The words say why:

- **"… is inside the current data folder"** or **"… is in the app's own folder"** (an update or an uninstall
  replaces it) — choose a folder outside it.
- **"… can't hold the data: its path is longer than 180 characters"** or **"its name ends in a dot or a space"**
  — choose a folder with a shorter or plainer path.
- **"… can't hold the data: it isn't there"** — the folder was moved or its drive unplugged: pick one that is
  there.
- **"… can't hold the data: the data needs … GB of room"** — pick a bigger drive, or make room.
- **"The folder …\Just House Paint already exists and isn't empty"** — something else is in the folder the move
  would make: choose another folder.
- **"The old copy of the data is still in …"** — an earlier move left it there: remove it first (**App Settings
  → Storage → Remove the old copy…**), then move the data there. (To move back to the default folder, remove the
  old copy there first: **Move back to the default folder…** shows again once it's gone.)
- **"The data folder holds a link to a file …, which Windows lets the app make again only with Developer Mode
  on"** — replace the link with the file itself, or move it out of the data folder.

**"The data couldn't be copied to …".** The move stopped and said why — "a file is bigger than its drive can
hold" is a FAT32 drive (a USB stick, often), which takes no file over 4 GB: format it exFAT or NTFS, or pick
another drive; "the copy of … came out incomplete" is a drive that failed while it was written. Nothing changed:
the app goes on with the data where it was. **"The move couldn't be finished"** — the same: the data stays where
it was.

**Remove the old copy… refuses.**

- **"… holds the data folder in use — it isn't removed."** — that folder is the one the app uses now.
- **"The old copy in … isn't there"** — its drive is unplugged, or the folder was renamed or deleted: connect it,
  then remove it — or **Forget** it, which drops the app's record of it and leaves the drive as it is.
- **"The old copy in … didn't answer just now"** — its drive is slow to wake (a network drive, a disk asleep): try
  again in a moment.
- **"The folder in … isn't this old copy now"** — another drive is in its place, or the folder was copied by hand:
  it isn't removed. **Forget** it to stop listing it.
- **"A server of the app is using … now"** — a server started on its own runs on that copy: stop it first.
- **"Part of the old copy in … couldn't be removed"** — a program holds a file in it: close it and try again
  later.

**"A model is loaded — unload it first (AI Settings → Unload), then try again."** when clearing the models cache
in **App Settings → Storage**: unload the model on **AI Settings** first. **"Couldn't clear the models cache."**:
try again in a moment; **App Settings → Logs** has why.

## Updates

**"Couldn't update: …".** The update couldn't be checked for or downloaded — the words after it say why (often
no network). Press **Check again** in **App Settings → Updates** later, or download the new version from the
app's [releases](https://github.com/delebash/just-house-paint/releases).

## Logs

**A message showed a reference.** The reference finds the matching line in **App Settings → Logs**: the server
writes every failure there under the same reference, and this window's own errors land there too.

**Where are the logs?** **App Settings → Logs** shows them live; the files are in the data folder's `logs`
folder, one per day, kept 30 days. The AI engine's own output is in **AI Settings → AI engine console**.
