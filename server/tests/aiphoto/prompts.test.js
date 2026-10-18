// SPDX-License-Identifier: MIT
import { describe, expect, test } from "vitest";
import { colorPhrase, DEFAULT_PROMPT_TEMPLATES, renderPrompt } from "../../src/aiphoto/prompts.js";

describe("renderPrompt", () => {
  test("one surface, named paint", () => {
    expect(renderPrompt([{ surfaceLabel: "siding", colorHex: "#ad2c34", colorName: "Positive Red" }])).toBe(
      "Repaint only the siding of this house in Positive Red, color #AD2C34 exterior paint. Keep everything else in the photo exactly the same, including the lighting.",
    );
  });

  test("one surface, no name → the hex alone", () => {
    expect(colorPhrase({ colorHex: "#2f3d4c" })).toBe("color #2F3D4C");
    expect(renderPrompt([{ surfaceLabel: "front door", colorHex: "#2f3d4c" }])).toContain("front door of this house in color #2F3D4C exterior paint");
  });

  test("several surfaces name each with its color", () => {
    const p = renderPrompt([
      { surfaceLabel: "siding", colorHex: "#ad2c34", colorName: "Positive Red" },
      { surfaceLabel: "shutters", colorHex: "#2f3d4c", colorName: "Naval" },
    ]);
    expect(p).toBe(
      "Repaint this house's exterior paint: the siding in Positive Red, color #AD2C34; the shutters in Naval, color #2F3D4C. Keep everything else in the photo exactly the same, including the lighting.",
    );
  });

  test("templates are data — a stored override replaces the default, missing keys fall back", () => {
    const p = renderPrompt([{ surfaceLabel: "trim", colorHex: "#edeae0", colorName: "Alabaster" }], {
      single: "Paint the {surface} {name} ({hex}).",
    });
    expect(p).toBe("Paint the trim Alabaster (#EDEAE0).");
    expect(Object.isFrozen(DEFAULT_PROMPT_TEMPLATES)).toBe(true);
  });

  test("an unknown placeholder is left as written; no surfaces is an error", () => {
    expect(renderPrompt([{ surfaceLabel: "x", colorHex: "#000000" }], { single: "{surface} {nope}" })).toBe("x {nope}");
    expect(() => renderPrompt([])).toThrow(/no surfaces/);
  });
});
