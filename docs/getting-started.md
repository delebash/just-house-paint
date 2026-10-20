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
- **Windows with Smart App Control on** (some new Windows 11 computers) blocks the app with no **Run anyway**:
  its files aren't signed yet. It runs there once Smart App Control is off (Windows Security → App & browser
  control → Smart App Control) — Windows can't turn it back on without being reset, so choose knowingly.

**What it needs:**

- **Windows** 10 or 11, 64-bit. The part finder and the AI photo also need Microsoft's Visual C++
  Redistributable (2015–2022), which most computers have; where it's missing, they say so before anything
  downloads and name Microsoft's download (then open the house again). On Windows for ARM the app runs, and the AI photo works on the
  processor only (slow).
- **macOS** on Apple silicon (M1 and later). The AI photo needs macOS 26 or later.
- **Linux**: Ubuntu 22.04 or newer (or a system as recent). The AI photo needs Ubuntu 24.04 or newer
  (glibc 2.38).
- For the AI photo: a graphics card with 8 GB of its own memory and 12 GB of memory in the computer (16 GB on a
  Mac, or without such a card) — see [The AI photo](ai-photo.md). The app checks what it can before the 9 GB
  download and says what's missing.
- Room on the data folder's drive: about 3.6 GB free for the part finder, 10 GB for the AI photo (the app checks
  before it downloads).

**Updates:** the app looks for a new version each time it starts. **App Settings → Updates** shows
it: **Download** fetches it, and it installs when you quit the app (or press **Restart now**). On a
Mac, Updates offers **Open the release page**, to download it from there.

## The first time

1. **Add a photo of your house** on **Your houses**: press **Add a photo**. A photo from the front,
   in daylight, with the whole house in the frame works best. See [Your houses](your-houses.md).
2. **Install the part finder.** The house opens on its **Parts** tab, which offers the part finder:
   press **Install (3.1 GB)** — a download, once. See [Finding the parts](finding-parts.md).
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
- **App Settings** — **General** (photos, designs, the part finder, the AI photo, other windows), **Advanced**
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

The server started on its own uses the same data folder as the desktop app. Opening the desktop app
stops it and takes over (what it was doing stops too). Updates come through the desktop app — in a
browser, **App Settings → Updates** shows the version and what's new.

Several windows can use one server at once — the desktop app and a browser, two browsers, a phone. What
one changes shows in the others by itself within a few seconds (**App Settings → General → Other
windows** sets how often they look). Two people painting different parts of one design keep both. If
one changes a house's outlines (a brush stroke, a Box, a part added, Find the parts) just as the other
does, the later one is refused — "This house was changed in another window" — and the house is shown as it is
now: draw it again.

Behind a reverse proxy on the same computer (Caddy, nginx, `tailscale serve`), name its public address
in `JUST_HOUSE_PAINT_ALLOWED_HOSTS` (`paint.example.com`; several with commas) — the server answers
requests from its own computer only under its own names, so a web page can't reach it by renaming
itself — and keep an access token on: requests through a proxy always need one.

## Backups

**App Settings → Backups** saves everything — your houses, their photos and outlines, designs,
settings and your AI providers' keys — in one file, and restores it. Keep the file as you would a
password: the keys are in it. The access tokens are not, and a restore keeps this computer's own
(and its downloaded engines' settings). A backup can be made while you or another window keep working. A
restore is all or nothing: while it runs, other windows' changes are refused (try them again after), and then
they show the restored houses; if it can't finish, your data is as it was — work that was running (finding
parts, an AI photo) stops. In the rare case it can't even put your data back while it runs, it asks you to
restart the app, which puts it back as it starts.

## Everything stays on your computer

Your photos, designs and colors stay in the app's data folder (App Settings → Storage). Nothing is
uploaded unless you choose an online AI provider in AI Settings.

**Where to keep the data folder.** **Change folder…** moves it to an empty folder you pick. Best on a drive
inside the computer: a folder synced by OneDrive, Dropbox or another sync service can hold the app's files
while they are written, and OneDrive's "files on demand" leaves the 12 GB of models online-only, so the
engines fail without the network; a network drive or a USB stick works only while it is there. A FAT32 USB
stick can't hold the AI photo's model (over 4 GB). Keep the folder's path short (under 180 characters) — some
parts of the engines can't open longer ones.

> Colors on a screen are never exactly the paint. Check a real paint sample on your house before
> you buy.
