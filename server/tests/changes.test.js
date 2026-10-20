// SPDX-License-Identifier: MIT
// The windows' change counter (changes.js) under odd X-Client-Id values — the nineteenth review's fuzz: any length,
// any number of ids, each kept a day. An id is taken only when it is up to 64 visible ASCII characters, and at most 500
// windows are remembered, the one heard from longest ago forgotten first.
import { expect, test } from "vitest";
import { ChangeCounter, clientIdOf } from "../src/changes.js";

test("a window id is up to 64 visible ASCII characters — anything else counts as no window's", () => {
  expect(clientIdOf("6f1c0f8e-0b5e-4a8e-9a3e-1d2c3b4a5f6e")).toBe("6f1c0f8e-0b5e-4a8e-9a3e-1d2c3b4a5f6e");
  for (const bad of ["", "x".repeat(65), "a b", "café", "tab\there", null, 42]) expect(clientIdOf(bad), String(bad)).toBe(null);
  const c = new ChangeCounter();
  c.note("x".repeat(10_000));
  expect(c.windows).toBe(0);
  expect(c.revFor("x".repeat(10_000))).toBe(1); // everyone's change — no window of its own remembered
});

test("at most 500 windows are remembered: the one heard from longest ago goes first", () => {
  const c = new ChangeCounter();
  c.note("first");
  for (let i = 0; i < 600; i++) c.note(`w${i}`);
  expect(c.windows).toBe(500);
  // "first" was forgotten: its own change counts as another's now; the newest window still knows its own
  expect(c.revFor("w599")).toBe(600);
  // asking again keeps a window: heard from now, it is the newest
  c.revFor("w100");
  for (let i = 600; i < 900; i++) c.note(`w${i}`);
  expect(c.revFor("w100")).toBe(c.revFor("nobody") - 1);
});
