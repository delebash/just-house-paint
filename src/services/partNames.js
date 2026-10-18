// SPDX-License-Identifier: MIT
// A part's name on the screen: its catalog word (`parts.<key>` — the finder's recipe names each
// part it knows by that key, its `labelKey`), else its key in words ("sideDoor" → "side door") for
// a part added by hand under a key the catalog doesn't have.

/** "garageDoor" → "garage door". */
export const keyWords = (key) => String(key).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

/** `t` and `te` are vue-i18n's (useI18n()). */
export function partName(key, { t, te }) {
  const id = `parts.${key}`;
  return te(id) ? t(id) : keyWords(key);
}
