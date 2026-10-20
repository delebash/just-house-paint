# What's new

## v0.1.3

- **A dark wall painted light looks freshly painted.** Stained wood or a dark paint painted much
  lighter no longer shows the old finish's blotches and grain; the lines between the boards and the
  shadows stay. With **On it now** set, the app goes by that paint to tell a dark finish from a light
  one.
- **Decorations**: the finder finds the medallions and other ornaments on the walls as their
  own part — a garden statue in front isn't one. A scheme paints them the trim's color.
- **Trim** now takes the casings around the front door and the garage door, and no longer a fence's
  end board beside the house.
- **Only your house is painted**: the finder no longer finds windows, doors, soffits and trim on a
  neighbor's house in the photo.
- **The AI photo says when other programs slowed it**: under its time, the programs that held the
  graphics card when it started, and how much.
- **Linux**: the AppImage opens on Ubuntu 24.04 with nothing to install — before, its
  server didn't start.
- **The part finder's card says when it can't run** on the computer, before anything is downloaded.
- **Deleting a house** right after finding its parts no longer stops halfway.
- **Clearer at every step**: the parts stay listed when the part finder is removed; a search that
  finds nothing says so; on the first start the Colors and Schemes tabs say the brands are loading
  and pick one as it lands; a design name the house already has is shown under the name; an iPhone's
  HEIC photo gets words that say what to do; a failed AI photo, download or search says which.
- **By keyboard**: a ring shows where you are; the paint colors are one stop for Tab (the arrow
  keys move between them); the arrow keys move a zoomed photo; what is selected is said to a screen
  reader; why **AI photo** is off shows beside it; the outlines and the brush show on a white house
  too; hints and muted text are easier to read.
- **Safer on your network**: a web page open in your browser can't read or change the app's server
  any more; a backup no longer holds the access tokens, and a restore keeps this computer's own (and
  its engines' settings). See [On another computer, or without a window](getting-started.md#on-another-computer-or-without-a-window)
  and [Backups](getting-started.md#backups).
- **The server on its own on macOS and Linux** too, and **Copy** works in a browser on another computer.
- **The window** can be as narrow as half a 1920 px screen, and the house page fits it.
- A backup restored from an older version gets this one's settings at once, and a restored house's
  first **Find the parts** or **AI photo** no longer fails.
- A house whose parts were found before keeps them: **Find the parts again** (with **Keep the parts
  you changed by hand** ticked) gives it the new ones. A part you changed by hand stays as you drew
  it — if that is **Trim**, the door casings go with the walls: untick **Keep**, or add them to Trim
  with a **Box**.

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
