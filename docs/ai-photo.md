# The AI photo

**AI photo** makes a new picture of your house with the colors you picked, drawn by an image model
(FLUX.2 [klein] 4B) on your own computer. It repaints only inside the parts' outlines and puts your
original photo back everywhere else, then locks the painted areas to the paint colors.

Use it to see a whole scheme with the model's own sense of light. Its colors are approximate: the
model decides how the light falls, so one paint can look lighter on one wing than another. The
painted photo on the house page is the color-accurate view.

## Installing it

The first time, **AI photo** offers to download the engine (stable-diffusion.cpp) and the model —
about 9 GB, once. It needs a graphics card (NVIDIA, or one that supports Vulkan) with 8 GB of
memory; on a computer without one, a picture would take about ten minutes, and the app says so
before you install.

## Making one

Pick colors for the parts, then press **AI photo**. It takes from about 20 seconds to a minute on an
RTX 2070-class card; its progress shows under the house's name while it runs, with **Cancel**. Before it starts, the app frees the
graphics card — the part finder and a local AI model let go of it, and load again when next needed.
The picture opens when it is done, with **Save image**, how far its painted parts are from the paint
chips (**ΔE … from the chips**) and how long it took (**made in … s**). Every AI photo is kept on the
house's **Designs** tab: open one again, or delete it.

The graphics card does one thing at a time — an 8 GB card holds the AI photo's model or the part
finder, not both. While an AI photo is drawn, finding the parts, a **Box** and a local AI's color
schemes wait: the app says the card is busy. A second AI photo waits for the first.

The size the AI draws at, its prompts and how its picture is put back on your photo are in
**App Settings → General** and **Advanced**. **App Settings → Storage** shows how much space it takes;
**Remove** there frees it (your AI photos stay) and Install brings it back.
