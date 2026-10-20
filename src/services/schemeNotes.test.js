// SPDX-License-Identifier: MIT
// Every reason the server gives for a scheme it can't complete (harmony.js's notes) has words on
// the Schemes tab — a new note there fails here until it has its own.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { suggestSchemes } from "../../server/src/paints/harmony.js";
import { describe, expect, test } from "vitest";
import en from "../i18n/locales/en.json";
import { NOTE_KEYS, schemeReasons } from "./schemeNotes.js";

const harmonySource = readFileSync(resolve(import.meta.dirname, "../../server/src/paints/harmony.js"), "utf8");
// the notes harmony.js writes: notes.push("…") and notes: ["…"]
const NOTES = [...harmonySource.matchAll(/notes(?:\.push\(|: \[)"([^"]+)"/g)].map((m) => m[1]);
const lookup = (key) => key.split(".").reduce((o, k) => o?.[k], en);

describe("a scheme that can't be applied says why", () => {
  test("every note the server writes has its words in the catalog", () => {
    expect(NOTES.length).toBeGreaterThanOrEqual(7);
    for (const note of NOTES) {
      expect(NOTE_KEYS[note], note).toBeTruthy();
      expect(typeof lookup(NOTE_KEYS[note]), NOTE_KEYS[note]).toBe("string");
    }
    expect(typeof lookup("schemes.why.other")).toBe("string");
  });

  test("a near-gray body: the hue-based schemes say it has no hue; Classic is complete", () => {
    const gray = { id: "x:1", brand: "x", code: "1", name: "Gray", hex: "#798386", exterior: true, archived: false };
    const pool = [gray, { ...gray, id: "x:2", code: "2", hex: "#f4f2ea" }, { ...gray, id: "x:3", code: "3", hex: "#8b2f2f" }];
    const byKind = Object.fromEntries(suggestSchemes(gray, pool, { brand: "x" }).map((s) => [s.kind, s]));
    for (const kind of ["complementary", "analogous", "triadic", "monochrome"]) expect(schemeReasons(byKind[kind])).toEqual(["schemes.why.noHue"]);
    expect(schemeReasons({ complete: true, notes: [] })).toEqual([]);
    expect(schemeReasons({ complete: false, notes: ["something new"] })).toEqual(["schemes.why.other"]);
  });
});
