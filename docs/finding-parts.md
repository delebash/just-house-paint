# Finding the parts

The app finds your house's parts with a vision model (Meta's SAM 3) that runs on your own
computer. It looks for the body (the siding or walls), the trim, the front door, the garage door,
shutters, columns, railings, gutters, the soffits, the window trim and the chimney — and for what
usually isn't painted: the roof, the windows, stone, brick and lamps.

**Soffits and fascia** are the boards under the roof's edge. The finder looks for the roof's
overhang, so it finds them as the street sees them — the underside and the face board together.
It finds most of them, not always all — draw the rest with the brush or a box. A scheme paints
them the trim's color.

**Window trim** is the frame, casing and sill around each window: the finder outlines each window
and takes its glass out. The glass is **Windows**, which stays as it is. A
scheme paints it the trim's color; give it its own on the **Colors** tab — black window trim on a
white house, say.

## The first time: installing the part finder

Until it is installed, a house's **Parts** tab offers the part finder: **Install** downloads about
3.1 GB, once. Its progress shows on the card while it downloads; **Cancel** there stops it. On a
computer with a graphics card the finder uses the card; finding the parts of one photo takes about
half a minute (40 seconds the first time, while the model loads); its progress shows under the
house's name while it works — the part it is looking for and how far along it is ("Trim · 40%") — with
**Cancel**.

## When a part is wrong

The finder is good at doors, garage doors, windows and shutters, and less sure of thin parts —
fascia boards, soffits and some trim. A white fascia it missed stays in the body and takes the
body's color. Fix it with the tools above the photo, on the part selected on the **Parts** tab:

- **Outlines** draws the selected part's edge on the photo — or every part's, or none.
- **Brush** adds to the selected part: drag over what belongs to it. **Eraser** takes it away.
  **Brush size** sits beside them.
- **Box** — drag a box around something (a shutter, the fascia); the finder outlines what is inside
  it and gives it to the selected part, taking it from any other part.
- **Add the part** (under the list) — a part to paint that the finder knows but didn't find on this
  house: choose it, then draw it with the brush or a box.

A pixel belongs to one part only. Where two parts overlap, the more specific one keeps it (the
garage door before the door, the gutters before the trim) — the order is in **App Settings →
Advanced**.

Your fixes are kept, and **Undo** takes back the last ones. **Find the parts again** starts over
from what the finder sees. It asks first, and if you changed parts by hand — with the brush, the
eraser or a box — or added any, it offers to **keep** them as they are: the parts found now are then
cut around them. Untick it to have every part found again.

## Settings

**App Settings → General → Part finder**: whether the graphics card helps, after how many idle
minutes the finder lets go of its memory, how far past the house a part may reach, and how much of
a piece must be on the house to count — so a car parked in front isn't taken for a door. What the finder looks for — each part's words and
threshold — is in **App Settings → Advanced**. **App Settings → Storage** shows how much space it
takes; **Remove** there frees it (the parts already found stay) and Install brings it back.
