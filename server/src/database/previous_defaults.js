// SPDX-License-Identifier: MIT
// The earlier defaults of the settings whose default has changed — each one's fingerprint (the first
// 16 hex digits of the SHA-256 of its canonical JSON: object keys sorted), taken from git history.
// upgradeSettings (seed.js) gives a setting that still holds one of these — so its owner never edited
// it — today's default: a better default (a new part, a better word) reaches an install made before
// it, and a value the owner changed is never touched.
//
// When a default in SETTING_DEFAULTS changes, add the OUTGOING default's fingerprint here (the test
// tests/settings_upgrade.test.js holds today's fingerprints and fails until you do).
import { createHash } from "node:crypto";

/** JSON with every object's keys sorted, so two equal values always print the same. */
export function canonicalJson(value) {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v,
  );
}

/** A value's fingerprint: the first 16 hex digits of the SHA-256 of its canonical JSON. */
export const fingerprint = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 16);

export const PREVIOUS_DEFAULTS = Object.freeze({
  "finder.parts": Object.freeze([
    "b546f782bf3d4f2c", // the first build (42926bd), before v1's words
    "629c7d3be81f9187", // v1 (2026-10-18), before the soffit
    "c99b1a52cae7875b", // + the soffit (3922292)
    "57213ba5a0daf740", // + window trim from "window trim" alone, windows = the whole window (8972a89)
    "b77e3afbbe282820", // windows = the glass, window trim = the outline minus it (v0.1.0–v0.1.2)
  ]),
  "finder.priority": Object.freeze([
    "02777bb7d857eca9", // v1
    "5046ab385e0e91a1", // + the soffit (3922292)
    "69c2dcc097840fab", // + window trim (v0.1.0–v0.1.2)
  ]),
  "schemes.roleParts": Object.freeze([
    "bdf28dd165ea84cc", // the first build (42926bd)
    "17bb9a6fbb12c2e6", // v1
    "b8c404bde753f94f", // + the soffit (3922292)
    "ab90c1fb04750be9", // + window trim (v0.1.0–v0.1.2)
  ]),
  "aiphoto.compose": Object.freeze([
    "c7df3921fb6c1e9f", // before gainLimits (the paint on a part now)
    "2349559042b9098d", // + gainLimits, before castLimit and signalFloor (v0.1.0–v0.1.2)
  ]),
  "schemes.harmony": Object.freeze([
    "b11d8afd9127c603", // v1, before the classic door's traditional colors (27f4140)
  ]),
});
