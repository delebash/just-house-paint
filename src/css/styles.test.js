// SPDX-License-Identifier: MIT
// The app's shared styles a mounted test can't see (jsdom loads no stylesheet): a paint's swatch is
// ONE rule in app.scss that every tab uses — a copy scoped to the Parts tab left the Colors tab's
// swatches 0 × 0 (the visual review, 2026-10-20) — with the "none" swatch beside it.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";

const SRC = resolve(import.meta.dirname, "..");
const scss = readFileSync(join(SRC, "css/app.scss"), "utf8");
/** The declarations of the top-level rule whose selector is exactly `sel`. */
function rule(sel) {
  const at = scss.indexOf(`\n${sel} {`);
  return at < 0 ? "" : scss.slice(at, scss.indexOf("}", at));
}

test("a swatch has its size in app.scss, and no component keeps a copy of the rule", () => {
  expect(rule(".swatch")).toMatch(/width: 18px; height: 18px;/);
  expect(rule(".swatch")).toMatch(/display: block/);
  expect(rule(".swatch--big")).toMatch(/width: 28px; height: 28px;/);
  // "no color": the diagonal line across an empty box
  expect(rule(".swatch--none")).toMatch(/linear-gradient\(to top right/);
  const vues = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? vues(join(dir, e.name)) : e.name.endsWith(".vue") ? [join(dir, e.name)] : []));
  const copies = vues(SRC).filter((f) => /<style[\s\S]*\n\.swatch(--\w+)? \{/.test(readFileSync(f, "utf8")));
  expect(copies).toEqual([]);
});
