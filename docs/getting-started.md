# Getting started

Just House Paint shows your own house in real paint colors before you buy paint. You add a
photo of your house, the app finds its parts — the body, the trim, the doors, the shutters —
and you pick a brand's paint for each part. The paint shows on your photo with the photo's own
light and shadow, and each part says how close the painted wall comes to the paint chip.

## Installing it

Download the installer for your computer from the app's
[releases](https://github.com/delebash/just-house-paint/releases): **Windows** the `…-win-x64.exe`,
**macOS** the `.dmg`, **Linux** the `.AppImage`.
The installers aren't signed with a publisher's certificate yet, so the first time:

- **Windows** says "Windows protected your PC": press **More info**, then **Run anyway**.
- **macOS** says the app can't be opened: Control-click it in Applications and choose **Open**, or
  press **Open Anyway** in System Settings → Privacy & Security.
- **Linux**: make the `.AppImage` executable (`chmod +x`) and run it.

**Updates:** the app looks for a new version each time it starts. **App Settings → Updates** shows
it: **Download** fetches it, and it installs when you quit the app (or press **Restart now**). On a
Mac, Updates offers **Open the release page**, to download it from there.

## The first time

1. **Add a photo of your house** on **Your houses**: press **Add a photo**. A photo from the front,
   in daylight, with the whole house in the frame works best. See [Your houses](your-houses.md).
2. **Install the part finder.** The house opens on its **Parts** tab, which offers the part finder:
   press **Install** — a download of about 3.1 GB, once. See [Finding the parts](finding-parts.md).
3. **Find the parts.** Press **Find the parts**. It takes about half a minute.
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
  **Server** (its address for a browser on another device, keeping it running in the tray when the
  window closes, access tokens), **Logs**, **Updates** and **About**.
- The button at the top right of the title bar switches the theme: light, dark, or the system's.

## Everything stays on your computer

Your photos, designs and colors stay in the app's data folder (App Settings → Storage). Nothing is
uploaded unless you choose an online AI provider in AI Settings.

> Colors on a screen are never exactly the paint. Check a real paint sample on your house before
> you buy.
