// SPDX-License-Identifier: MIT
// The light on a part, read from the paint it has NOW ("On it now") — one rule for the screen's painter
// (src/services/tint.js) and the AI photo's lock (aiphoto/pixels.js). Browser-safe: the renderer imports it
// (just-house-paint-server/shared/light.js).
//
// The photo recorded the paint now as some color on the part's normally lit pixels; the light there is what turns
// the one into the other. Read per channel (photo ÷ paint), as the first build did, a colorful or dark paint's weak
// channels multiplied every small difference between the camera and the brand's published color: a red door
// photographed ΔE 2.2 off its chip turned Alabaster ΔE 14.2 green, and a black paint's glare (a few percent of
// white, added) clipped a white (the twenty-first review, RESEARCH §5). The standard way to read a light from a
// reference (white balance, von Kries) needs a near-neutral, well-lit reference, so:
//   - the brightness is the luminance's ratio, bounded by `gainLimits`;
//   - the color cast comes only from a paint whose every channel carries signal (linear ≥ `signalFloor`), and each
//     channel stays within `castLimit` of the brightness (±18 %: ×1/1.18 – ×1.18) — a colorful paint (a channel
//     under the floor) gives the brightness only;
//   - a paint darker than `signalFloor` (luminance) gives no reading at all: what the camera saw there is mostly
//     glare and sheen, not light.
// The limits are the setting `aiphoto.compose` (gainLimits, castLimit, signalFloor) — these are its first values.

/** The setting's first values (data — seeded with aiphoto.compose, editable in App Settings → Advanced). */
export const LIGHT_DEFAULTS = Object.freeze({
  gainLimits: Object.freeze([0.25, 4]),
  castLimit: 0.18,
  signalFloor: 0.05,
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Relative luminance of linear r, g, b (Rec. 709 primaries — sRGB's). */
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** The light limits out of an `aiphoto.compose` value (or any object holding them); a missing or unusable one is
 *  its first value — an install whose compose was edited before these keys existed still has all three. */
export function lightLimitsOf(compose = {}) {
  const g = compose?.gainLimits;
  const pair = Array.isArray(g) && g.length === 2 && g.every((x) => Number.isFinite(x) && x > 0) && g[0] < g[1];
  const num = (v, d) => (Number.isFinite(v) && v >= 0 ? v : d);
  return {
    gainLimits: pair ? [g[0], g[1]] : [...LIGHT_DEFAULTS.gainLimits],
    castLimit: num(compose?.castLimit, LIGHT_DEFAULTS.castLimit),
    signalFloor: num(compose?.signalFloor, LIGHT_DEFAULTS.signalFloor),
  };
}

/**
 * The light, per channel, from `seen` — the photo's color on the part's normally lit pixels — and `now` — the paint
 * on it now — both linear [r, g, b] (0–1). [1, 1, 1] when the paint now is too dark to read a light from.
 */
export function lightFrom(seen, now, limits = LIGHT_DEFAULTS) {
  const { gainLimits: [lo, hi], castLimit, signalFloor } = lightLimitsOf(limits);
  const yNow = lum(now);
  if (!(yNow > 0) || yNow < signalFloor) return [1, 1, 1];
  const g = clamp(lum(seen) / yNow, lo, hi);
  if (Math.min(...now) < signalFloor) return [g, g, g];
  return now.map((n, c) => clamp(g * clamp(seen[c] / n / g, 1 / (1 + castLimit), 1 + castLimit), lo, hi));
}
