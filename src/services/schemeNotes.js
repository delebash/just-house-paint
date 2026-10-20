// SPDX-License-Identifier: MIT
// Why a scheme on the Schemes tab can't be applied, in the reader's words. The server says it in
// each scheme's `notes` (server/src/paints/harmony.js — English, for logs and tests); this maps
// every note it writes to a catalog key, so the row says why instead of showing empty colors and a
// silent disabled Apply (the visual review, 2026-10-20: a near-gray body — OKLCH chroma under the
// setting's achromaticChroma — has no hue for complementary, analogous, triadic or one-color
// schemes). schemeNotes.test.js holds every note harmony.js can write against this list.
export const NOTE_KEYS = {
  "the base color has no hue to build this scheme on": "schemes.why.noHue",
  "no paint to snap the body to": "schemes.why.noBody",
  "no paint near the trim target is light or dark enough against the body": "schemes.why.noTrim",
  "no paint near the accent target is colorful and distinct enough": "schemes.why.noAccent",
  "the trim is not light or dark enough against the body": "schemes.why.pairTrim",
  "the brand lists no further coordinating color for the accent": "schemes.why.pairNoAccent",
  "the accent is not colorful or distinct enough": "schemes.why.pairAccent",
};

/** The catalog keys saying why `scheme` can't be applied — none when it can; a note this list
 *  doesn't know yet still gives a reason. */
export function schemeReasons(scheme) {
  if (scheme?.complete) return [];
  const keys = [...new Set((scheme?.notes || []).map((n) => NOTE_KEYS[n] || "schemes.why.other"))];
  return keys.length ? keys : ["schemes.why.other"];
}
