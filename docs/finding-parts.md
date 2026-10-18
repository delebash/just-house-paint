# Finding the parts

The app finds your house's parts with a vision model (Meta's SAM 3) that runs on your own
computer. It looks for the body (the siding or walls), the trim, the front door, the garage door,
shutters, columns, railings, gutters and the chimney — and for what usually isn't painted: the
roof, the windows, stone, brick and lamps.

## The first time: installing the part finder

Until it is installed, a house's **Parts** tab offers the part finder: **Install** downloads about
3.1 GB, once. The download shows under **AI tasks** in the sidebar; its Cancel stops it. On a
computer with a graphics card the finder uses the card; finding the parts of one photo takes about
half a minute (40 seconds the first time, while the model loads).

## When a part is wrong

The finder is good at doors, garage doors, windows and shutters, and less sure of thin parts —
fascia boards, soffits and some trim. A white fascia it missed stays in the body and takes the
body's color. Fix it with the tools above the photo, on the part selected on the **Parts** tab:

- **Outlines** draws each part's edge on the photo.
- **Brush** adds to the selected part: drag over what belongs to it. **Eraser** takes it away.
  **Brush size** sits beside them.
- **Box** — drag a box around something (a shutter, the fascia); the finder outlines what is inside
  it and gives it to the selected part, taking it from any other part.
- **Add the part** (under the list) — a part the finder knows but didn't find on this house: choose
  it, then draw it with the brush or a box.

A pixel belongs to one part only. Where two parts overlap, the more specific one keeps it (the
garage door before the door, the gutters before the trim) — the order is in **App Settings →
Advanced**.

Your fixes are kept. **Find the parts again** starts over from what the finder sees; it asks first.

## Settings

**App Settings → General → Part finder**: whether the graphics card helps, and after how many idle
minutes the finder lets go of its memory. What the finder looks for — each part's words and
threshold — is in **App Settings → Advanced**.
