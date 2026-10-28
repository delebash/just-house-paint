# Getting started

Just House Paint shows your own house in real paint colors before you buy paint. You add a
photo of your house, the app finds its parts — the body, the trim, the doors, the shutters —
and you pick a brand's paint for each part. The paint shows on your photo with the photo's own
light and shadow, and each part says how close the painted wall comes to the paint chip.

## Installing it

Download the installer for your computer from the app's
[releases](https://github.com/delebash/just-house-paint/releases): **Windows** the `…-win-x64.exe`,
**macOS** (Apple silicon — M1 and later) the `.dmg`, **Linux** the `.AppImage`.
The installers aren't signed with a publisher's certificate yet, so the first time:

- **Windows** says "Windows protected your PC": press **More info**, then **Run anyway**.
- **macOS** says the app can't be opened. On macOS 15 and later: open **System Settings → Privacy & Security**,
  go to **Security** and press **Open Anyway** (it's there for about an hour after you try to open the app), then
  enter your password. On macOS 14 and earlier: Control-click the app in Finder and choose **Open**. If it says the
  app "is damaged", run `xattr -cr "/Applications/Just House Paint.app"` in Terminal once, then open it.
- **Linux**: make the `.AppImage` executable (`chmod +x`) and run it — nothing else to install. Where the
  system keeps an AppImage out of Chromium's sandbox (Ubuntu 24.04 and later), the app's window runs without
  it; the window shows only the app's own pages.
- **Windows with Smart App Control on** (some new Windows 11 computers) blocks the app with no **Run anyway**, and
  it can't let one app through on its own: the app's files aren't signed yet. It runs once Smart App Control is off
  (Windows Security → App & browser control → Smart App Control). With recent Windows updates you can turn it back
  on in the same place; before them, turning it back on took a clean install of Windows.

**What it needs:**

- **Windows** 10 or 11, 64-bit. The part finder and the AI photo also need Microsoft's Visual C++
  Redistributable (2015–2022), which most computers have; where it's missing, they say so before anything
  downloads and name Microsoft's download (then open the house again). On Windows for ARM the app runs, and the AI
  photo works on the processor only (slow).
- **macOS** on Apple silicon (M1 and later). The AI photo needs macOS 26 or later.
- **Linux**: Ubuntu 22.04 or newer (or a system as recent). The AI photo needs Ubuntu 24.04 or newer
  (glibc 2.38).
- **For the AI photo**: about 6.6 GB of the graphics card's own memory and 12 GB of the computer's (all of it from
  the computer's with no graphics card it can use) — its chip says **Won't fit** when the estimate finds too little.
  It is quickest on Windows with an NVIDIA card: about 20 seconds on an 8 GB card; without a graphics card it takes
  about ten minutes. On other graphics cards — AMD, Intel, Apple silicon, and NVIDIA on Linux — the app shows a speed
  once it has measured one. See [The AI photo](ai-photo.md).
- **Room on the drive**, as the app counts it: 3.4 GB on the data folder's drive for the part finder (**Install
  (3.1 GB)**); for the AI photo, on the drive that holds the AI engines and models, about 2.2 GB for its engine on
  Windows with an NVIDIA card (**Install the engine (865 MB)** — the download and its unpacked files at once; much
  less on most other computers) and 8.4 GB for its model (**Download the model (8.1 GB)**). The app checks before it
  downloads, and says what the computer lacks — the system, the room on the drive.

**Updates:** the app looks for a new version when it starts, every 6 hours, and shortly after the computer wakes.
**App Settings → Updates** shows it: **Download** fetches it, and it installs when you quit the app (or press
**Restart now**). With **Keep server running after the app closes** on, closing the window only hides it: the update
installs when you quit from the tray. On a Mac, Updates offers **Open the release page**, to download it from there.
See [Updates](settings.md#updates).

## The first time

1. **Add a photo of your house** on **Your houses**: press **Add a photo**. A photo from the front,
   in daylight, with the whole house in the frame works best. See [Your houses](your-houses.md).
2. **Install the part finder.** The house opens on its **Parts** tab, which offers the part finder:
   press **Install (3.1 GB)** — a download, once. See [Finding the parts](finding-parts.md).
3. **Find the parts.** Press **Find the parts**. It takes about a minute on Windows with a graphics card, longer
   on macOS and Linux, where it runs on the processor.
4. **Paint colors load by themselves.** When the app opens, it loads each brand that has no colors here yet,
   one after another — the first time, seven brands, about 17,000 colors, a few seconds each (the stack at the
   bottom right shows them). **Paint colors** in the sidebar lists them; turn **Load automatically** off for a brand
   you don't want loaded. See [Paint colors](paint-colors.md).
5. **Paint.** Select a part, pick a color on the **Colors** tab, and see it at once. Save the colors
   you like as a design. See [Painting your house](painting.md).

## Where things are

- **Your houses** — every photo you added, with its designs.
- **The house page** — the photo with the paint on it, the tools above it, and the tabs **Parts**,
  **Colors**, **Schemes** and **Designs** beside it.
- **Paint colors** — the brands' colors on this computer.
- **AI Settings** — the AI model the color-scheme suggestions use. See [Set up the AI](ai-providers.md).
- **App Settings** — **General** and **Advanced** (the app's settings), **Appearance**, **Backups**, **Storage**,
  **Server**, **Logs**, **Updates** and **About**. See [App Settings](settings.md).
- **The title bar** — the arrows at its left go back and forward; at its right, the theme button switches the
  theme (the system's, light, dark), and the **AI tasks** button beside it shows the work running and what failed —
  see [The AI tasks panel](ai-providers.md#the-ai-tasks-panel).
- **Help** — the **?** beside a page's title opens that page's help.

## The tray

The desktop app has an icon in the system tray (on a Mac, the menu bar). Clicking it shows or hides the window. Its
menu: **Show window**, **Hide window**, **Start server**, **Stop server**, **Restart server**, **Open settings**,
**Copy server URL** (the address a browser on this computer opens), **Open log file**, **About Just House Paint** and
**Quit Just House Paint**.

- **Stop server** leaves the window on "Can't reach the Just House Paint server" — its **Retry** doesn't start it
  again — until you press **Start server** (or **Restart server**).
- **Restart server** stops the work that was running (finding parts, an AI photo, a download); start it again.
- The server items are off while the data folder is being moved.
- Closing the window quits the app, unless **Keep server running after the app closes** is on
  (**App Settings → Server**): then the window hides and the server keeps running — **Quit Just House Paint** quits.

## On another computer, or without a window

The desktop app's server answers only on its own computer. To use Just House Paint from a browser
on another computer or a tablet, start the server on its own on the computer that has your houses,
listening on your network:

1. In the desktop app, add an access token (**App Settings → Server**): without one, anyone on your
   network can open it. **Copy the address with this token** copies `http://127.0.0.1:17499/…` —
   keep it; you'll put the computer's network address in place of `127.0.0.1`.
2. Quit the desktop app (the tray's **Quit Just House Paint**): one server at a time can use your data.
3. Start the server on its own, in a terminal:
   - **Windows** — in the app's folder (where `justhousepaint.exe` is; unless you chose another, in
     PowerShell `cd "$env:LOCALAPPDATA\Programs\justhousepaint"`):
     `.\just-house-paint-server serve --host 0.0.0.0`. The first time, Windows asks whether the app may use
     the network: allow it on private networks, or other computers can't reach it.
   - **macOS** — `"/Applications/Just House Paint.app/Contents/Resources/just-house-paint-server" serve --host 0.0.0.0`
   - **Linux** — unpack the AppImage once (`./just-house-paint-*.AppImage --appimage-extract`), then
     `squashfs-root/just-house-paint-server serve --host 0.0.0.0`. The unpacked copy doesn't update itself:
     after an update, unpack the new AppImage again.
4. On the other computer, open the address from step 1 with this computer's network address in it
   (`http://<its address>:17499/…`). The address: Windows `ipconfig` ("IPv4 Address"), macOS
   `ipconfig getifaddr en0`, Linux `hostname -I`.

The server started on its own uses the same data folder as the desktop app, and has no tray: **Ctrl+C** in its
terminal stops it. Opening the desktop app stops it too and takes over (what it was doing stops) — when it runs on
the usual port, 17499, and was started by the same user on this computer; otherwise the desktop app says another
server is using the data folder. Updates come through the desktop app — in a browser, **App Settings → Updates**
shows the version and what's new.

Several windows can use one server at once — the desktop app and a browser, two browsers, a phone. What
one saves shows in the others by itself within a few seconds (**App Settings → General → Other
windows** sets how often they look; a window waits while one of its dialogs is open or you type in a field). The
colors you pick show in the others once you save the design; two people painting different parts of one design
keep both. If one changes a house's outlines (a brush stroke, a Box, a part added, Find the parts) just as the other
does, the later one is refused — "This house was changed in another window" — and the house is shown as it is
now: draw it again. While another window is finding the house's parts, a stroke or a Box says "The parts are being
found": wait for it to finish.

**Behind a reverse proxy on the same computer** (Caddy, nginx, `tailscale serve`): name its public address in
`JUST_HOUSE_PAINT_ALLOWED_HOSTS` (`paint.example.com`; several with commas) — the server answers requests from its
own computer only under its own names, so a web page can't reach it by renaming itself; until the name is there, the
browser shows the token page and no token is accepted. Keep an access token on, and make sure a request through the
proxy needs it: the server can't tell a proxy from a browser on this computer unless the proxy says so. Either
turn on **Require a token on this computer too** (**App Settings → Server**), or have the proxy send
`X-Forwarded-For` — Caddy sends it; in nginx add `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.

## The command line

`just-house-paint-server serve` takes these options (`npm run server` in a source checkout):

- `--host` — the address it listens on: `127.0.0.1` (this computer only) unless you name another; `0.0.0.0` is
  every network the computer is on.
- `--port` — `17499` unless you name another.
- `--data-dir` — the data folder; it must already exist (one that isn't there is refused, never made). Without it,
  the folder the desktop app uses.
- `--log-level` — `debug`, `info` (the default), `warning` or `error`: how much it writes to its log.

Each option can also be a variable — `JUST_HOUSE_PAINT_HOST`, `JUST_HOUSE_PAINT_PORT`, `JUST_HOUSE_PAINT_DATA_DIR`,
`JUST_HOUSE_PAINT_LOG_LEVEL` (the option wins). `JUST_HOUSE_PAINT_DATA_DIR` set for the desktop app moves its data
folder too (see [Storage](settings.md#storage)). `JUST_HOUSE_PAINT_ALLOWED_HOSTS` names a reverse proxy's
addresses (above).

Behind a company proxy, the desktop app hands the system's proxy to its server by itself. A server started on its
own uses only the `HTTPS_PROXY` and `HTTP_PROXY` variables (and `NO_PROXY`); a SOCKS proxy isn't supported. Both
trust the certificates the computer trusts.

One server per data folder: a second one says "Another Just House Paint server is using this data folder … — stop
it first" (after 10 to 15 seconds), or give it its own `--data-dir`.

## Backups

**App Settings → Backups** saves your houses, their photos and outlines, designs, paint colors, settings and your
AI providers' keys in one file, and restores it — keep the file as you would a password. The access tokens are not
in it, nor the downloaded engines and models. See [Backups](settings.md#backups), and
[Reset Just House Paint](settings.md#reset-just-house-paint) to start again.

## Everything stays on your computer

Your photos, designs and colors stay in the app's data folder (**App Settings → Storage**). Nothing is
uploaded unless you choose an online AI provider in AI Settings — and that provider gets your house's colors as
text and the words you add, never the photo. The app does go online to download: the brands' color lists, the
part finder, the AI photo, AI models, and its updates. Where the data folder is, and how to move it:
[Where to keep the data folder](settings.md#where-to-keep-the-data-folder).

> Colors on a screen are never exactly the paint. Check a real paint sample on your house before
> you buy.
