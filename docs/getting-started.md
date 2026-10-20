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
- **macOS** says the app can't be opened: Control-click it in Applications and choose **Open**, or
  press **Open Anyway** in System Settings → Privacy & Security. If it says the app "is damaged",
  run `xattr -cr "/Applications/Just House Paint.app"` in Terminal once, then open it.
- **Linux**: make the `.AppImage` executable (`chmod +x`) and run it — nothing else to install. Where the
  system keeps an AppImage out of Chromium's sandbox (Ubuntu 24.04 and later), the app's window runs without
  it; the window shows only the app's own pages.

**Updates:** the app looks for a new version each time it starts. **App Settings → Updates** shows
it: **Download** fetches it, and it installs when you quit the app (or press **Restart now**). On a
Mac, Updates offers **Open the release page**, to download it from there.

## The first time

1. **Add a photo of your house** on **Your houses**: press **Add a photo**. A photo from the front,
   in daylight, with the whole house in the frame works best. See [Your houses](your-houses.md).
2. **Install the part finder.** The house opens on its **Parts** tab, which offers the part finder:
   press **Install** — a download of about 3.1 GB, once. See [Finding the parts](finding-parts.md).
3. **Find the parts.** Press **Find the parts**. It takes under a minute.
4. **Paint colors load by themselves.** The first time the app starts, it loads seven brands'
   colors from their sites (about 17,000 colors, a few seconds each — the stack at the bottom right
   shows them). **Paint colors** in the sidebar lists them and turns a brand off. See
   [Paint colors](paint-colors.md).
5. **Paint.** Select a part, pick a color on the **Colors** tab, and see it at once. Save the colors
   you like as a design. See [Painting your house](painting.md).

## Where things are

- **Your houses** — every photo you added, with its designs.
- **The house page** — the photo with the paint on it, the tools above it, and the tabs **Parts**,
  **Colors**, **Schemes** and **Designs** beside it.
- **Paint colors** — the brands' colors on this computer.
- **AI Settings** — the AI model the color-scheme suggestions use. See [Set up the AI](ai-providers.md).
- **App Settings** — **General** (photos, designs, the part finder, the AI photo), **Advanced**
  (the same settings' structured parts), then **Appearance** (theme, font, size, language),
  **Backups**, **Storage** (the space each part takes, and **Change folder…** to move the data),
  **Server** (its address and the command that starts it on its own, keeping it running in the tray
  when the window closes, access tokens — **Copy the address with this token** gives an address that
  signs a browser in), **Logs**, **Updates** and **About**.
- The button at the top right of the title bar switches the theme: light, dark, or the system's.

## On another computer, or without a window

The desktop app's server answers only on its own computer. To use Just House Paint from a browser
on another computer or a tablet, start the server on its own on the computer that has your houses,
listening on your network:

- **Windows** — in the app's folder (where `justhousepaint.exe` is):
  `just-house-paint-server serve --host 0.0.0.0`
- **macOS** — `"/Applications/Just House Paint.app/Contents/Resources/just-house-paint-server" serve --host 0.0.0.0`
- **Linux** — unpack the AppImage once (`./Just-House-Paint-*.AppImage --appimage-extract`), then
  `squashfs-root/just-house-paint-server serve --host 0.0.0.0`

Then open `http://<that computer's address>:17499` in the other browser. Add an access token first
(**App Settings → Server**): without one, anyone on your network can open it. **Copy the address
with this token** copies the address the page was opened at — from the desktop window that is
`127.0.0.1`; put the server computer's network address in its place.

The server started on its own uses the same data folder as the desktop app, and one server at a
time can: opening the desktop app stops a server started on its own on the same computer (what it
was doing stops too). Updates come through the desktop app — in a browser, **App Settings →
Updates** shows the version and what's new.

## Everything stays on your computer

Your photos, designs and colors stay in the app's data folder (App Settings → Storage). Nothing is
uploaded unless you choose an online AI provider in AI Settings.

> Colors on a screen are never exactly the paint. Check a real paint sample on your house before
> you buy.
