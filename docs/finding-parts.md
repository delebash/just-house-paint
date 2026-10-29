# Finding the parts

The app finds your house's parts with a vision model (Meta's SAM 3) that runs on your own
computer. It looks for the body (the siding or walls), the trim, the front door, the garage door,
shutters, columns, railings, gutters, the soffits, the window trim, the chimney and decorations —
and for what usually isn't painted: the roof, the windows, stone, brick and lamps.

It finds them on **your** house — the one the photo is framed on, its wings and garage included. A
neighbor's house in the photo is left as it is, even right beside yours, and so are a car parked in
front and a garden statue. That works when the finder recognizes your house in the photo, and while
**Parts reach past the house by** (App Settings → General → Part finder) is above 0.

**Trim** includes the casings around the front door and the garage door. A board the finder takes
for trim has to lie at least partly on the house itself, so a fence's end board beside the house
isn't painted.

**Soffits and fascia** are the boards under the roof's edge. The finder looks for the roof's
overhang, so it finds them as the street sees them — the underside and the face board together.
It finds most of them, not always all — draw the rest with the brush or a box. A scheme paints
them the trim's color.

**Window trim** is the frame, casing and sill around each window: the finder outlines each window
and takes its glass out. The glass is **Windows**, which stays as it is. A
scheme paints it the trim's color; give it its own on the **Colors** tab — black window trim on a
white house, say.

**Decorations** are the medallions and other ornaments on the walls — a round medallion in a gable,
say. Only what lies on the house counts: a garden statue in front of it doesn't (an ornament hung on
a wall or a door can).
A scheme paints them the trim's color; give them their own on the **Colors** tab.

## The first time: the part finder's model

The part finder runs on ONNX Runtime, which is part of the app — nothing to install — with its model SAM 3, kept in
the AI cache with the app's other AI models (the family's apps share it). Until the model is on this computer, a
house's **Parts** tab says "The part finder needs its model, SAM 3, which isn't on this computer yet": **Download
the model (3.1 GB)** downloads it, once. Before it downloads, the app checks that the drive holding the AI engines
and models has room, and says how much it needs and has if not. Its progress bar shows there while it downloads;
**Cancel** stops it, and the next download goes on where it stopped. Beside the step, the model's chip says whether
it fits this computer. If ONNX Runtime can't run on the computer, the **Parts** tab says why instead and offers
nothing to download. **AI Settings → Vision** shows the model too, with **Download** and **Delete**.

**Updating from version 0.1.3 or earlier:** the part finder you already installed is moved into the AI cache when
the app starts — nothing to download again.

On a Windows computer with a graphics card the finder uses the card (on macOS and Linux it runs on the
processor, which is slower); finding the parts of one photo takes about a minute on Windows with a graphics card
(a little longer the first time, while the model loads), longer on the processor. Its progress shows under the
house's name while it works — the part it is looking for and how far along it is ("Trim · 40%") — with
**Cancel**. While it works, the **Brush**, the **Eraser**, the **Box**, **Undo** and **Redo** are off:
the parts it finds replace the outlines when it's done, and Undo starts over from them. Open the house again — or
reload the window — while it works, and its progress shows there again, and the new parts load when it's done.

If the finder finds nothing, the **Parts** tab says **No parts found on this photo**: a photo with the house in
full view, from the front, works best — or press **Find the parts again**. With no parts there is nothing to add
a part to, so try another photo. If it doesn't recognize a house but finds a door or a window, those are
listed without a **Body** — the same advice holds.

## When a part is wrong

The finder is good at doors, garage doors, windows and shutters, and less sure of thin parts —
fascia boards, soffits and some trim. On a house painted one color all over it can't tell the corner
boards, the band under the eaves or a scalloped skirt board from the siding: they stay in the body
and take the body's color until you give them to **Trim** with a **Box** around each one. Where something stands
in front of the house — a bush, a flower pot, a car — the walls' outline can stop a little short of it, leaving a
thin strip of wall in its old color: brush that strip into the body. Fix a part with the tools above the photo, on
the part selected on the **Parts** tab:

- **Outlines** draws the selected part's edge on the photo — or every part's, or none.
- **Brush** adds to the selected part: drag over what belongs to it. **Eraser** takes it away.
  **Brush size** sits beside them.
- **Box** — drag a box around something (a shutter, the fascia), or click one corner and then the
  other; the finder outlines what is inside it and gives it to the selected part, taking it from any
  other part. **Escape** lets go of a box half drawn. Box is off until the part finder's model is downloaded.
- **Add the part** (under the list) — a part to paint that the finder knows but didn't find on this
  house: choose it, then draw it with the brush or a box.

The brush and the eraser draw a path on the photo, so they need a mouse, a pen or touch — a pen's
eraser end erases whichever is chosen, and only a mouse's left button (a finger, a pen's tip) draws. With
the keyboard, select the part on the **Parts** tab (Tab to it, **Enter**) and draw a box with the arrow
keys and **Enter** — under **With the keyboard** in [Painting your house](painting.md).

What the finder finds, and what a **Box** gives a part, belong to that part only. Where two parts the finder
found overlap, the more specific one keeps it (the garage door before the door, the gutters before the trim) —
the order is in **App Settings → Advanced**. The **Brush** only adds to the selected part and takes nothing from
another: where two outlines then cover the same spot, the part lower on the **Parts** tab shows there. To give
that spot to the other part, erase it from the one that shows, or draw a **Box**.

Your fixes are kept, and **Undo** takes back the last ones. **Find the parts again** starts over
from what the finder sees. It asks first, and if you changed parts by hand — with the brush, the
eraser or a box (a box changes only the part it gives to) — or added any, it offers **Keep the parts you changed by
hand** (it names them), ticked: the parts found now are then cut around them, and what the finder would have added
to a kept part goes to the body, where it lies on the house (past the house, it goes to no part). A kept part stays
as you drew it — a kept **Trim** doesn't get the door casings the finder now finds; they go with the walls. Untick
it to have every part found again: a part you added that the finder doesn't find is then removed.

## Settings

**App Settings → General → Part finder** (see [General](settings.md#general)):

- **Parts reach past the house by (share of the photo)** — how far past the house a part may reach; 0 turns off
  both checks on the house, this one and the next.
- **A piece counts when this share of it is on the house** — so a car parked in front isn't taken for a door.

Where the finder runs is its preset: select **Find the parts** under **AI Settings → Routing by feature** (see
[The AI features](ai-features.md)). **Runs on** is **The graphics card, where it can** at first — on Windows the
photo's heaviest step runs on the graphics card and the rest on the processor; on macOS and Linux all of it on the
processor — or **The processor only** (slower, and it never waits for the graphics card). It applies from the next
find. How long the finder keeps its memory with nothing to do is **Let go after idle (minutes)** on **AI Settings →
Vision** — 10 at first; 0 keeps it. After that it loads again when next needed, which takes a little longer.
**Updating from version 0.1.3 or earlier:** your **Use the graphics card (Windows)** and **Let go after (minutes
idle)** move there.

What the finder looks for — each part's words and threshold — is in **App Settings → Advanced**. **AI Settings →
Vision** deletes its model (the parts already found stay) and downloads it again; **App Settings → Storage** counts
it with the AI cache.
