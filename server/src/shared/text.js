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

// Characters a name never keeps: control characters (NUL and the C0/C1 ranges) and the bidi embeddings, overrides and
// isolates (U+202A–202E, U+2066–2069) — an override in a name spilled into the sentence around it; LRM and RLM stay
// (a right-to-left name may need them). And the invisible ones, which make two names that look the same different
// (a zero-width space, joiners, the word joiner, the BOM) — the nineteenth review's fuzz.
const DROPPED = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/gu;
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/gu;

/** A name a person gave, as it is kept: in Unicode's composed form (NFC — "Café" typed two ways is one name),
 *  without control or bidi-override characters, its spaces collapsed and trimmed. */
export function cleanName(text) {
  return String(text ?? "")
    .normalize("NFC")
    .replace(DROPPED, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** What two names are compared by: the kept name without its invisible characters, in lower case — "Blue" and
 *  "Blue" with a zero-width space are one name. Empty: the name shows nothing. */
export const nameKey = (text) => cleanName(text).replace(INVISIBLE, "").toLocaleLowerCase();
