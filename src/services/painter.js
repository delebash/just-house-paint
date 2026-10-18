// SPDX-License-Identifier: MIT
// The house page's painter: the display photo's pixels, each part's mask and what tint.js needs
// for it (its normally lit level, its blurred light for the texture setting), kept between paints —
// so a color click repaints at once, and only a changed mask or texture is prepared again.
// Pure over arrays: the page hands it ImageData pixels and masks, and draws what it returns.

import { chipDeltaE, luminance, preparePart, tintPhoto } from "./tint.js";

const hex2 = (v) => v.toString(16).padStart(2, "0");
const median = (values) => {
  values.sort((a, b) => a - b);
  return values[values.length >> 1];
};
/** The per-channel median of the pixels at `indices`, as #rrggbb — one stray pixel or a shadow edge
 *  doesn't decide it, as an average would let it. */
function medianHex(rgba, indices) {
  const r = [];
  const g = [];
  const b = [];
  for (const i of indices) {
    r.push(rgba[i * 4]);
    g.push(rgba[i * 4 + 1]);
    b.push(rgba[i * 4 + 2]);
  }
  return `#${hex2(median(r))}${hex2(median(g))}${hex2(median(b))}`;
}

/** At most this many pixels make a part's color (a stride over its outline) — enough for a median. */
const MEDIAN_SAMPLES = 20_000;

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
    /** The photo's own color around a pixel (the eyedropper): the median of a (2r+1)² square. */
    sample(x, y, r = 3) {
      const indices = [];
      for (let yy = Math.max(0, y - r); yy <= Math.min(height - 1, y + r); yy++)
        for (let xx = Math.max(0, x - r); xx <= Math.min(width - 1, x + r); xx++) indices.push(yy * width + xx);
      return medianHex(rgba, indices);
    },
    /** A part's color as photographed: the median of the photo inside its outline; null without one. */
    photographed(key) {
      const mask = parts.get(key)?.mask;
      if (!mask) return null;
      let area = 0;
      for (let i = 0; i < mask.length; i++) if (mask[i] >= 128) area++;
      if (!area) return null;
      const stride = Math.max(1, Math.floor(area / MEDIAN_SAMPLES));
      const indices = [];
      for (let i = 0, n = 0; i < mask.length; i++) if (mask[i] >= 128 && n++ % stride === 0) indices.push(i);
      return medianHex(rgba, indices);
    },
  };
}
