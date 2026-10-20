// SPDX-License-Identifier: MIT
// What a palette file's import leaves out — rows of a table, swatches, blocks — counted by why and said in words, at
// most five numbers each: "12 rows without a usable color (rows 3, 7, 9, 15, 20 …)". One warning each made 400 bad
// rows a 64,692-character toast (the nineteenth review) and a 400-swatch CMYK palette 21,091 characters (the
// twentieth).

/** A tally of left-out things named `one` / `many` ("swatch", "swatches"). */
export function leftOut(one, many) {
  const why = new Map();
  return {
    /** Thing number `n` left out for `reason` (words that follow the count: "without a usable color"). */
    add(reason, n) {
      if (!why.has(reason)) why.set(reason, []);
      why.get(reason).push(n);
    },
    /** One sentence per reason. */
    words() {
      return [...why].map(([reason, ns]) => {
        const name = ns.length === 1 ? one : many;
        return `${ns.length} ${name} ${reason} (${name} ${ns.slice(0, 5).join(", ")}${ns.length > 5 ? " …" : ""})`;
      });
    },
  };
}
