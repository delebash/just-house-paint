// SPDX-License-Identifier: MIT
// The house page's painter: the display photo's pixels, each part's mask and what tint.js needs
// for it (its normally lit level, its blurred light for the texture setting), kept between paints —
// so a color click repaints at once, and only a changed mask or texture is prepared again.
// Pure over arrays: the page hands it ImageData pixels and masks, and draws what it returns.

import { chipDeltaE, luminance, preparePart, tintPhoto } from "./tint.js";

export function createPainter({ rgba, width, height }) {
  const Y = luminance(rgba);
  const parts = new Map(); // key → { mask, texture, prepared }

  const prepared = (key) => {
    const p = parts.get(key);
    if (!p) return null;
    p.prepared ??= preparePart({ Y, mask: p.mask, width, height, texture: p.texture });
    return p.prepared;
  };

  return {
    width,
    height,
    /** Set (or replace) a part's mask; it is prepared again on the next paint. */
    setMask(key, mask, texture = 1) {
      parts.set(key, { mask, texture, prepared: null });
    },
    /** The texture setting (0–1) of every part; changing it re-prepares them. */
    setTexture(texture) {
      for (const p of parts.values()) {
        if (p.texture !== texture) Object.assign(p, { texture, prepared: null });
      }
    },
    mask: (key) => parts.get(key)?.mask || null,
    /** A brush stroke changed a mask in place: prepare it again. */
    touched(key) {
      const p = parts.get(key);
      if (p) p.prepared = null;
    },
    keys: () => [...parts.keys()],
    /**
     * The painted photo for `colors` ({ part: hex }) in `order` (later parts paint over earlier
     * ones). Returns { rgba, deltaE: { part: ΔE2000 to the chip | null } }.
     */
    paint(colors, order = Object.keys(colors)) {
      const assignments = [];
      for (const key of order) {
        const hex = colors[key];
        const part = hex ? prepared(key) : null;
        if (part?.pixels) assignments.push({ key, part, hex });
      }
      const out = tintPhoto({ photo: rgba, Y, assignments });
      const deltaE = {};
      for (const a of assignments) deltaE[a.key] = chipDeltaE({ tinted: out, Y, part: a.part, hex: a.hex });
      return { rgba: out, deltaE };
    },
    /** The part under a pixel: the last in `order` whose mask covers it (what is painted on top). */
    partAt(x, y, order) {
      const i = y * width + x;
      for (let k = order.length - 1; k >= 0; k--) if (parts.get(order[k])?.mask[i] >= 128) return order[k];
      return null;
    },
  };
}
