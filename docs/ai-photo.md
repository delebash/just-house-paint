# The AI photo

**AI photo** makes a new picture of your house with the colors you picked, drawn by an image model
(FLUX.2 [klein] 4B) on your own computer. It repaints only inside the parts' outlines and puts your
original photo back everywhere else, then locks what it repainted to the paint colors.

Use it to see a whole scheme with the model's own sense of light. Its colors are approximate: the
model decides how the light falls, so one paint can look lighter on one wing than another. A part in separate
pieces keeps them together: a shutter or a door the model draws much lighter than the part's others comes out only a
little lighter, and one it draws much darker no darker than deep shade. The
painted photo on the house page is the color-accurate view (the AI photo's own note calls it "the instant
preview"). The **Light** and **Texture** sliders don't change the AI photo.

## Installing it

The AI photo runs on the AI engine stable-diffusion.cpp with the model FLUX.2 [klein] 4B — the same engines the
family's apps share, kept in the AI cache with the app's other AI models. The first time, **AI photo** says what it
needs, one step at a time, each with its progress bar and **Cancel**:

1. "The AI photo runs on stable-diffusion.cpp, which isn't installed on this computer yet" — **Install the engine
   (865 MB)** on Windows with an NVIDIA card (a few dozen MB on most other computers).
2. "The AI photo needs its model, FLUX.2 [klein] 4B, which isn't on this computer yet" — **Download the model
   (8.1 GB)**, once.

Before each download the app checks that the drive holding the AI engines and models has room for it, and says how
much it needs and has if not. Nothing downloads until you press the button. Both are also on **AI Settings →
Images**, which shows the engine and the model with **Remove** and **Delete**.

Beside the step, the model's chip says how it should run on this computer — the same chip the chat models have on
**Providers & models**:

- **Fits** or **Won't fit** — from the memory it takes: about 6.6 GB of the graphics card's own memory and 12 GB of
  the computer's; on a computer with no graphics card it can use, all of it from the computer's. With too little,
  it says the estimate finds too little memory; you can still try.
- **~fast** … **~very slow** — the speed expected here: about 20 seconds a picture on Windows with an NVIDIA card,
  about ten minutes with no graphics card it can use. On other graphics cards the app knows no figure yet and shows
  none. After your first AI photo, the time this computer really took replaces the estimate (no "~").

Where the engine has no build for the computer's system at all, or the system is too old (macOS before 26, a Linux
before Ubuntu 24.04), it says so and offers nothing to install.

**Updating from version 0.1.3 or earlier:** the model you already downloaded is moved into the AI cache when the app
starts — nothing to download again. The engine needs one install of its newer version (**Install the engine**); the
older one is removed when it's done.

## Making one

Pick colors for the parts, then press **AI photo**. Until it can run, the button is off and the
reason shows beside the buttons — **AI photo: Find the parts first**, **AI photo: No part to paint has an outline
yet** (draw one with the brush or a box), or **AI photo: Give a part a color first**. On Windows with an 8 GB NVIDIA
card it takes about 20 seconds; the first one after the app starts takes longer while the model loads (longer still
when the app's data is on a hard disk). Its progress shows under the house's name while it runs, with **Cancel** —
also when you open the house again, or reload the window, while it runs. When it starts and the
graphics card needs the room, an idle AI engine lets go of it — the part finder, a local AI model; each loads again
when next needed.

When it is done, the picture opens — if the house page is still open; otherwise it waits on the **Designs** tab —
with **Save image**, how far the painted parts are from the paint chips (**ΔE … from the chips — furthest off:**
and the part that is furthest off) and how long the drawing itself took (**made in … s**). The model sometimes leaves
a small part as it was photographed — a door under a porch, say. Then the AI photo draws that part again from a
close-up crop around it, so the model sees it large; the progress names it (**Front door up close · 97%**), and it
takes another drawing's time (about 15 seconds). The new drawing is kept only when the part comes out closer to its
paint. Only small parts get a close-up, two at most — **App Settings → Advanced → How the AI photo is put back on the
photo** sets which ones. Only what the model repainted is locked to your paint, so a part still left as
photographed is the one named, with a large ΔE; the painted photo on the house page shows it in its paint. When other programs held more than 1 GB of the
graphics card as it started, it names them too (programs holding 200 MB or more each; **App Settings → General →
AI photo** sets that amount, 0 turns it off). That is measured only on Windows and on Linux with an NVIDIA card, and
shown only when the picture first opens. They are the programs on the computer that draws it: the server's, when
you use the app from a browser on another computer; with the server started on its own, a browser showing the app
on that computer is one of them. Every AI photo is kept on the house's **Designs** tab: open one again, or delete
it. An AI photo made from colors not saved in a design — or whose design you deleted — is listed as **Colors on
screen**. **Save image** saves it at most at the size **Save image and the AI photo, at most (megapixels)** sets
(**App Settings → General → Photos**).

The AI engines take turns on the graphics card — an 8 GB card holds the AI photo's model or the part finder's, not
both. When one needs the room, an idle one lets go of it; while one is working — an AI photo being drawn, the parts
being found on the card, a local AI model making color schemes — the other says "The graphics card is busy": try
again when it's done. **AI photo** pressed again on the same house while one is drawn follows that one. Finding the parts on the
processor (on macOS and Linux, or with **Runs on: The processor only** — see [Finding the
parts](finding-parts.md#settings)) and color schemes from an online provider never wait.

The size the AI draws at (**Working size**), its prompts and how its picture is put back on your photo are in
**App Settings → General** and **Advanced** (see [App Settings](settings.md)). How it draws — the model, the steps,
the guidance, the seed — is its preset, **Draw the AI photo** under **AI Settings → Routing by feature** (see
[The AI features](ai-features.md)). **AI Settings → Images** removes the engine and deletes the model (your AI
photos stay); **App Settings → Storage** counts them with the AI cache.
