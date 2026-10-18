// SPDX-License-Identifier: MIT
// Shared with the renderer (the server package exports ./shared/*; app-structure §Q.3): the brush
// runs on the screen, a tap runs here, and both must change a mask the same way.
// A part's mask is a Uint8Array (0–255) the size of the house's display photo — the size every
// mask is stored at (the part finder's own masks are 288×288, so a ≤2048 px display copy loses
// nothing; the full-size export scales them up). These are the touch-up operations: the brush
// adds, the eraser removes, a tap's area moves between parts, and the outline shows where a part
// ends. Pure functions — the canvas (Konva) only draws what they return.

/** Stamp a filled circle at (cx, cy), `value` 255 (add) or 0 (erase), with a 1 px soft rim. */
export function stampCircle(mask, w, h, cx, cy, radius, value) {
  const r = Math.max(0.5, radius);
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(h - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cover = Math.max(0, Math.min(1, r + 0.5 - d)); // 1 inside, 0 outside, a ramp on the rim
      if (cover <= 0) continue;
      const i = y * w + x;
      const target = value ? 255 : 0;
      mask[i] = Math.round(mask[i] + (target - mask[i]) * cover);
    }
  }
  return mask;
}

/** A brush stroke through `points` ([{x, y}] in mask pixels): circles every half radius. */
export function stroke(mask, w, h, points, radius, mode) {
  const value = mode === "erase" ? 0 : 255;
  if (!points.length) return mask;
  stampCircle(mask, w, h, points[0].x, points[0].y, radius, value);
  const step = Math.max(0.5, radius / 2);
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let s = 1; s <= n; s++) stampCircle(mask, w, h, a.x + ((b.x - a.x) * s) / n, a.y + ((b.y - a.y) * s) / n, radius, value);
  }
  return mask;
}

/**
 * Give `region` (a mask) to the part `target`: it joins the target and leaves every other part.
 * `masks` is { partKey: Uint8Array }; returns the keys that changed.
 */
export function assignRegion(masks, target, region) {
  const changed = new Set();
  for (const [key, m] of Object.entries(masks)) {
    for (let i = 0; i < m.length; i++) {
      if (region[i] < 128) continue;
      if (key === target) {
        if (m[i] !== 255) {
          m[i] = 255;
          changed.add(key);
        }
      } else if (m[i] !== 0) {
        m[i] = 0;
        changed.add(key);
      }
    }
  }
  return [...changed];
}

/** Remove `region` from one part only (a tap in erase mode). */
export function subtractRegion(mask, region) {
  let changed = false;
  for (let i = 0; i < mask.length; i++) {
    if (region[i] >= 128 && mask[i] !== 0) {
      mask[i] = 0;
      changed = true;
    }
  }
  return changed;
}

/** How many pixels a mask covers (≥ half). */
export function area(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] >= 128) n++;
  return n;
}

/** The part's edge: 255 where an inside pixel touches an outside one (4-neighbour). */
export function outline(mask, w, h) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] < 128) continue;
      const edge =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 || mask[i - 1] < 128 || mask[i + 1] < 128 || mask[i - w] < 128 || mask[i + w] < 128;
      if (edge) out[i] = 255;
    }
  }
  return out;
}

/**
 * The RGBA pixels that draw a mask as a colored overlay (for the outlines and the "show parts"
 * view): `rgb` at `alpha` (0–1) where the mask is set.
 */
export function overlayPixels(mask, rgb, alpha = 0.45) {
  const out = new Uint8ClampedArray(mask.length * 4);
  const [r, g, b] = rgb;
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (!mask[i]) continue;
    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
    out[p + 3] = Math.round(mask[i] * alpha);
  }
  return out;
}
