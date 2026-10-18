# Troubleshooting

**"Can't reach the server".** The app's server isn't running, or its port (17497) is taken by
another program — the screen says which when it knows. The desktop app starts the server itself:
the tray's **Restart server** starts it again and **Open log file** shows why it stopped.
Headless, start it with `just-house-paint-server serve` (`npm run server` from a source checkout).
The app won't open without its server: there is no offline mode to lose work in.

**Another copy is already running.** One server per data folder: a second one says that another
Just House Paint server is using this data folder. Quit the other copy (the tray's **Quit**), or
give the second one its own `--data-dir`.

**"Suggest schemes" fails.** No AI is set up yet: open **AI Settings** and run Quick Setup, or add
an online provider and make it the default. The **AI tasks** panel keeps the failed request with
its reason and **Retry**. "Find the parts first" means the house has no parts yet: the AI reads
the house's colors from them.

**A part is wrong, or a white board took the body's color.** The part finder missed it — thin
trim and fascia boards are its weak spot. Select the part it belongs to and draw a **Box** around
it, or use the **Brush**. See [Finding the parts](finding-parts.md).

**The part finder or the AI photo won't install.** The download shows under **AI tasks** with its
reason; a cancelled or broken download resumes where it stopped the next time you press
**Install**. A file that doesn't match its checksum is deleted and downloaded again.

**The AI photo fails on "out of memory".** It needs about 8 GB of graphics memory. The app lets go
of the part finder and the local AI model first; close other programs that use the graphics card
(games, video editors) and try again. Lower **App Settings → General → AI photo → Working size**
if it still fails.

**A brand's colors won't load.** The brand's website didn't answer, or changed. **Paint colors**
shows the last try's reason on the brand's row; try **Load again** later, or import the brand's
palette file instead.

**A model won't load.** Its bar on AI Settings shows why. Usually the model needs more memory than
the computer has free — pick a smaller one, or unload another model first. **Settings → Logs**
has the engine's own words.

**A message showed a reference.** The reference finds the matching line in **Settings → Logs**:
the server writes every failure there under the same reference, and this window's own errors land
there too.

**Where are the logs?** **Settings → Logs** shows them live; the files are in the data folder's
`logs` folder, one per day.
