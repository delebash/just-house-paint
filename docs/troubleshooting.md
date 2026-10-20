# Troubleshooting

**"Can't reach the Just House Paint server".** The app's server isn't running, or its port (17499) is taken —
the screen says which when it knows:

- **Another program is using port 17499** — close that program, then press **Retry**.
- **Another person signed in to this computer has the app open** — one copy runs at a time on a computer: they
  quit theirs (its tray icon, **Quit**), then press **Retry**.
- **Windows has reserved port 17499** (Hyper-V, WSL or Docker reserve ranges of ports at start) — restarting
  the computer usually frees it. `netsh int ipv4 show excludedportrange protocol=tcp` lists the reserved
  ranges. To keep the port free for the app, open a Command Prompt as administrator and run `net stop winnat`,
  then `netsh int ipv4 add excludedportrange protocol=tcp startport=17499 numberofports=1 store=persistent`,
  then `net start winnat`, and restart the computer.
- **Its server stopped as it started** — the words after it say why; **Open log file** in the tray shows the
  rest.

The desktop app starts the server itself: the tray's **Restart server** starts it again and **Open log file**
shows why it stopped.
Started on its own, the command is `just-house-paint-server serve` — where it is on each system:
[On another computer, or without a window](getting-started.md#on-another-computer-or-without-a-window)
(`npm run server` from a source checkout).
The app won't open without its server: there is no offline mode to lose work in.

**"Just House Paint needs an access token".** The server has access tokens on (**App Settings →
Server** on the computer it runs on) and this browser has none, or a wrong one. Paste one of those
tokens and press **Connect** — or open the address **Copy the address with this token** gives. The
browser keeps it. The desktop app on the server's own computer asks only when **Require a token on
this computer too** is on and its window has none (the window that turns it on keeps one).

**Another copy is already running.** One server per data folder: a second one says that another
Just House Paint server is using this data folder. Quit the other copy (the tray's **Quit Just House Paint**), or
give the second one its own `--data-dir` (a folder that already exists — one that isn't there is refused, never
made). The desktop app is the exception: opening it stops a server started on its own on its usual port (17499)
and takes over — what that server was doing stops. If another server takes over the desktop app's folder while
it runs, the window reloads and says so.

**"Suggest schemes" fails.** No AI is set up yet: open **AI Settings** and run Quick Setup, or add
an online provider and make it the default. The **AI tasks** panel keeps the failed request with
its reason and **Run it again**. "Find the parts first" means the house has no parts yet: the AI reads
the house's colors from them.

**"The graphics card is busy".** An AI photo is being drawn, a house's parts are being found, or AI
color schemes are being made on this computer's AI model: the card does one at a time (an 8 GB card
holds one of their models). Wait for it, or press **Cancel** on its progress.

**"This house was changed in another window".** The app is open somewhere else too (another window, a
browser, a phone) and its outlines changed there — a stroke, a Box, a part added, the parts found — just before
your stroke, Box, part or **Find the parts**. Yours wasn't saved; the house now shows them as they are — do it
again. "The house is being read again" means this window is fetching another window's change: draw again in a
moment. "The parts are being found" means
another window is finding this house's parts: wait for it to finish.

**"A file in the app's data is open in another program"** when restoring a backup. Nothing was changed.
Close the program using the app's data folder — an image viewer, a backup or sync tool — and restore
again.

**"A backup is being restored" or "The app is being reset".** Another window is restoring or resetting
the app; your change wasn't saved. When it is done every window shows the data as it is then — do it again.

**"A change is still being saved"** when restoring or resetting. Another window's change was still being saved
after a minute, so nothing was replaced. Try again in a moment.

**"The app needs a restart" or "The restore couldn't put your data back".** A restore stopped half-way and a
file held by another program kept the app from putting your data back while it ran. Close the program, then
quit the app and open it again: it puts your data back as it starts.

**"Some colors aren't loaded any more"** for the AI photo. A brand was removed, or loaded again without
some colors, here or in another window. Load the brand again (**Paint colors**), or pick other colors for
the parts it names.

**A part is wrong, or a white board took the body's color.** The part finder missed it — thin
trim and fascia boards are its weak spot. Select the part it belongs to and draw a **Box** around
it, or use the **Brush**. See [Finding the parts](finding-parts.md).

**"The part finder can't run on this computer".** Its engine (ONNX Runtime) didn't load here, so
**Install** is off and nothing is downloaded. The words after it say why; **App Settings → Logs** has
the same line. Restart the app after fixing what it names.

**Windows blocks the app ("Smart App Control blocked …").** Smart App Control runs only signed programs, and
the app isn't signed yet — see [Installing it](getting-started.md#installing-it).

**The part finder or the AI photo says this computer doesn't have Microsoft's Visual C++ runtime.** Install it
from the link it gives (Microsoft's Visual C++ Redistributable, 2015–2022), then open the house again — nothing
was downloaded yet. "Older than this engine needs": install the latest from the same link and start the app
again.

**"A file … is missing" or "Files of the AI photo's engine are gone".** An antivirus may have quarantined one of
the engine's files. Restore it from the antivirus (and allow the app's folder), or press **Install** again for
the AI photo — install the app again for the part finder.

**"Not enough room on the drive".** The part finder needs about 3.6 GB free on the drive of the app's data folder,
the AI photo about 10 GB. Make room, or move the data folder to a bigger drive (**App Settings → Storage →
Change folder…**).

**"The data folder … can't be used".** The folder the app keeps its data in isn't there (a USB drive unplugged, a
network folder offline, the folder renamed) or can't be written. Plug it back in and press **Try again**. **Use the
default folder** opens the app on its default folder this time only — your data stays where it is, and the app
asks again at its next start. If that folder is gone for good, **App Settings → Storage → Use the default folder
from now on…** stops the question (nothing in the old folder is touched). When choosing a folder (**Change
folder…**), one whose path would be over 180 characters, or whose name ends in a dot or a space, is refused, and
so is a folder inside the app's own folder.

**"The data folder is already being moved"** or **"The data is being moved — quit when it's done".** A **Change
folder…** is still copying: wait for it to finish (the app restarts on the new folder). Until then the app's server
stays stopped, and the app can't be quit.

**"The data couldn't be copied to …".** The move stopped and said why — "a file is bigger than its drive can hold"
is a FAT32 drive (a USB stick, often), which takes no file over 4 GB: format it exFAT or NTFS, or pick another
drive. Nothing changed: the app goes on with the data where it was.

**"The old copy of the data is still in …".** **Move back to the default folder…** found the copy the earlier move
left there: remove it first (**App Settings → Storage → Remove the old copy…**), then move back.

**"Not a photo" for an iPhone's HEIC photo.** The app reads JPEG, PNG and WebP. Send or
save the photo as JPEG, or set the iPhone to take JPEGs (**Settings → Camera → Formats → Most
Compatible**).

**The part finder or the AI photo won't install.** The **AI tasks** panel (the sidebar) keeps the failed
download with its reason; a cancelled or broken download resumes where it stopped the next time you press
**Install**. A file that doesn't match its checksum is deleted and downloaded again.

**The AI photo fails on "out of memory".** It needs about 8 GB of graphics memory. The app lets go
of the part finder and the local AI model first; close other programs that use the graphics card
(games, video editors) and try again. Lower **App Settings → General → AI photo → Working size**
if it still fails.

**The AI photo is slower some times than others.** It takes about 20 seconds on an 8 GB graphics card
with nothing else on it. Another program holding the card's memory — another app's AI model, even an
idle one — makes it slower (Windows first moves that program's memory off the card), and one that is
working on the card at the same time slows it more. Close the other AI app, or wait for its model to
unload, for the fastest result. When other programs held more than 1 GB of the card as it started, the
AI photo names them under its time; **App Settings → General → AI photo** sets that amount (0 turns it
off).

**A brand's colors won't load.** The brand's website didn't answer, or changed. **Paint colors**
shows the last try's reason on the brand's row; try **Load again** later, or import the brand's
palette file instead.

**A model won't load.** Its bar on AI Settings shows why. Usually the model needs more memory than
the computer has free — pick a smaller one, or unload another model first. **App Settings → Logs**
has the engine's own words.

**A message showed a reference.** The reference finds the matching line in **App Settings → Logs**:
the server writes every failure there under the same reference, and this window's own errors land
there too.

**Where are the logs?** **App Settings → Logs** shows them live; the files are in the data folder's
`logs` folder, one per day.
