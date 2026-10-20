# The AI photo

**AI photo** makes a new picture of your house with the colors you picked, drawn by an image model
(FLUX.2 [klein] 4B) on your own computer. It repaints only inside the parts' outlines and puts your
original photo back everywhere else, then locks what it repainted to the paint colors.

Use it to see a whole scheme with the model's own sense of light. Its colors are approximate: the
model decides how the light falls, so one paint can look lighter on one wing than another. The
painted photo on the house page is the color-accurate view (the AI photo's own note calls it "the instant
preview"). The **Light** and **Texture** sliders don't change the AI photo.

## Installing it

The first time, **AI photo** offers to download the engine (stable-diffusion.cpp) and the model, once:
**Install (9.0 GB)** on Windows with an NVIDIA card, about 8.2 GB on most other computers. It checks first that the
drive of the app's data folder has room — 9.5 GB on Windows with an NVIDIA card, about 8.5 GB on most others.

How fast it draws depends on the graphics card, and the card says so before you install:

- **Windows with an NVIDIA card** (8 GB of its own memory) — about 20 seconds a picture.
- **Other graphics cards** — AMD, Intel, Apple silicon, and NVIDIA on Linux — run a slower build: "on this
  computer's graphics card one AI photo may take several minutes".
- **No graphics card it can use** — "one AI photo would take about ten minutes".

It needs about 8 GB of the graphics card's own memory, which the app doesn't check. It does check the computer's
memory — 12 GB with a graphics card of its own, 16 GB on a Mac or with the processor's own graphics — and with less
the card says it "may be very slow, or not finish"; **Install** stays on. Where the engine has no build for the
computer's system at all, or the system is too old (macOS before 26, a Linux before Ubuntu 24.04), the card says so
and offers nothing to install.

## Making one

Pick colors for the parts, then press **AI photo**. Until it can run, the button is off and the
reason shows beside the buttons — **AI photo: Find the parts first**, **AI photo: No part to paint has an outline
yet** (draw one with the brush or a box), or **AI photo: Give a part a color first**. On Windows with an 8 GB NVIDIA
card it takes about 20 seconds; the first one after the app starts takes longer while the model loads (longer still
when the app's data is on a hard disk). Its progress shows under the house's name while it runs, with **Cancel** —
also when you open the house again, or reload the window, while it runs. Before it starts, the app frees the
graphics card — the part finder and a local AI model let go of it, and load again when next needed.

When it is done, the picture opens — if the house page is still open; otherwise it waits on the **Designs** tab —
with **Save image**, how far the painted parts are from the paint chips (**ΔE … from the chips**: the part furthest
off) and how long the drawing itself took (**made in … s**). When other programs held more than 1 GB of the
graphics card as it started, it names them too (programs holding 200 MB or more each; **App Settings → General →
AI photo** sets that amount, 0 turns it off). That is measured only on Windows and on Linux with an NVIDIA card, and
shown only when the picture first opens. They are the programs on the computer that draws it: the server's, when
you use the app from a browser on another computer; with the server started on its own, a browser showing the app
on that computer is one of them. Every AI photo is kept on the house's **Designs** tab: open one again, or delete
it. An AI photo made from colors not saved in a design — or whose design you deleted — is listed as **Colors on
screen**. **Save image** saves it at most at the size **Save image and the AI photo, at most (megapixels)** sets
(**App Settings → General → Photos**).

The graphics card does one thing at a time — an 8 GB card holds the AI photo's model or the part finder, not both.
While an AI photo is drawn, finding the parts, a **Box**, a local AI's color schemes and a second AI photo aren't
started; while the parts are found, an AI photo waits too; and while a local AI model makes color schemes, a new AI
photo waits. The app says the card is busy — try again when it's done. They take turns on macOS and Linux too,
where the part finder runs on the processor. Color schemes from an online provider never wait.

The size the AI draws at (**Working size**), its prompts and how its picture is put back on your photo are in
**App Settings → General** and **Advanced** (see [App Settings](settings.md)). **App Settings → Storage** shows how
much space it takes; **Remove** there frees it (your AI photos stay) and Install brings it back.
