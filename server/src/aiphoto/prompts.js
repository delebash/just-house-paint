// SPDX-License-Identifier: MIT
// The AI photo's prompt — templates are DATA with defaults; the app seeds them into its
// database (editable in Settings) and passes the stored ones to `aiRepaint({templates})`.
//
// Placeholders: {surface} the surface's label ("siding"), {color} the color phrase below,
// {name} the paint's name, {hex} its #RRGGBB, {list} the per-surface items joined.
// The single-surface default follows the prompt the probe measured (RESEARCH §9/§10:
// "Repaint only the house siding in Sherwin-Williams Positive Red, color #AD2C34. Keep … the
// same.") without the probe's hand-written list of this one photo's other parts.

export const DEFAULT_PROMPT_TEMPLATES = Object.freeze({
  single:
    "Repaint only the {surface} of this house in {color} exterior paint. Keep everything else in the photo exactly the same, including the lighting.",
  multi:
    "Repaint this house's exterior paint: {list}. Keep everything else in the photo exactly the same, including the lighting.",
  item: "the {surface} in {color}",
  separator: "; ",
  colorNamed: "{name}, color {hex}",
  colorUnnamed: "color {hex}",
});

const fill = (template, values) =>
  template.replace(/\{(\w+)\}/g, (whole, key) => (Object.hasOwn(values, key) ? String(values[key]) : whole));

/** The color phrase of one surface: "Positive Red, color #AD2C34" or "color #AD2C34". */
export function colorPhrase({ colorHex, colorName }, templates = DEFAULT_PROMPT_TEMPLATES) {
  const hex = String(colorHex).toUpperCase();
  const name = (colorName || "").trim();
  return name ? fill(templates.colorNamed, { name, hex }) : fill(templates.colorUnnamed, { hex });
}

/**
 * The prompt for one or several surfaces — `[{surfaceLabel, colorHex, colorName?}]`.
 * One surface uses `single`; several use `multi` with one `item` per surface.
 */
export function renderPrompt(surfaces, templates = DEFAULT_PROMPT_TEMPLATES) {
  const t = { ...DEFAULT_PROMPT_TEMPLATES, ...templates };
  if (!surfaces.length) throw new TypeError("renderPrompt: no surfaces");
  const values = (s) => ({
    surface: s.surfaceLabel,
    color: colorPhrase(s, t),
    name: (s.colorName || "").trim(),
    hex: String(s.colorHex).toUpperCase(),
  });
  if (surfaces.length === 1) return fill(t.single, values(surfaces[0]));
  const list = surfaces.map((s) => fill(t.item, values(s))).join(t.separator);
  return fill(t.multi, { list });
}
