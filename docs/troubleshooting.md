# Troubleshooting

**"Can't reach the Just House Paint server".** The app's server isn't running, or its port (17499) is taken by
another program — the screen says which when it knows. The desktop app starts the server itself:
the tray's **Restart server** starts it again and **Open log file** shows why it stopped.
Headless, start it with `just-house-paint-server serve` (`npm run server` from a source checkout).
The app won't open without its server: there is no offline mode to lose work in.

**"Just House Paint needs an access token".** The server has access tokens on (**App Settings →
Server** on the computer it runs on) and this browser has none, or a wrong one. Paste one of those
tokens and press **Connect** — or open the address **Copy the address with this token** gives. The
browser keeps it; the desktop app on the server's own computer never asks.

**Another copy is already running.** One server per data folder: a second one says that another
Just House Paint server is using this data folder. Quit the other copy (the tray's **Quit**), or
give the second one its own `--data-dir`.

**"Suggest schemes" fails.** No AI is set up yet: open **AI Settings** and run Quick Setup, or add
an online provider and make it the default. The **AI tasks** panel keeps the failed request with
its reason and **Retry**. "Find the parts first" means the house has no parts yet: the AI reads
the house's colors from them.

**"The graphics card is busy".** An AI photo is being drawn, or a house's parts are being found:
the card does one at a time (an 8 GB card holds one of their models). Wait for it, or press
**Cancel** on its progress.

**A part is wrong, or a white board took the body's color.** The part finder missed it — thin
trim and fascia boards are its weak spot. Select the part it belongs to and draw a **Box** around
it, or use the **Brush**. See [Finding the parts](finding-parts.md).

**"The part finder can't run on this computer".** Its engine (ONNX Runtime) didn't load here, so
**Install** is off and nothing is downloaded. The words after it say why; **App Settings → Logs** has
the same line. Restart the app after fixing what it names.

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
unload, for the fastest result. When other programs held more than 1 GB of the card while it drew, the
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
