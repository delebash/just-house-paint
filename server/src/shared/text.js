// SPDX-License-Identifier: MIT
// Words cut to a length a person reads them by — by grapheme (Intl.Segmenter): a name or a sentence cut by
// UTF-16 units split an emoji (a lone surrogate) or a family emoji without its last member (the thirteenth
// review, 2026-10-20). Browser-safe: the renderer may import it too.

/**
 * `text` cut to at most `max` UTF-16 units — the length the schema counts — between characters as a
 * person sees them (grapheme clusters, Intl.Segmenter — developer.mozilla.org/docs/Web/JavaScript/
 * Reference/Global_Objects/Intl/Segmenter): a cut at 80 units split an emoji, and the name kept half of
 * it (a lone surrogate) or a family emoji without its last member.
 */
export function cutToLength(text, max) {
  if (text.length <= max) return text;
  let out = "";
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
    if (out.length + segment.length > max) break;
    out += segment;
  }
  // one such character longer than that on its own (a run of combining marks): its code points
  if (!out) {
    for (const c of text) {
      if (out.length + c.length > max) break;
      out += c;
    }
  }
  return out;
}
