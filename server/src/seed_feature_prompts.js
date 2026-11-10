// SPDX-License-Identifier: MIT
// The default prompt of each AI action (app-structure §8, §11: a "prompt-row-owned" feature) —
// seeded into the shared `feature_prompts` table insert-if-missing, then read from the database
// on every run, so the AI Lab can edit and save it. Keyed by the ACTION id; each row names its
// routing `feature`, the `system` prompt, the `user_template` ({{var}} placeholders the caller
// fills — runAiFeature's `variables`) and its JSON contract (`json_mode`). Every tunable is the
// engine preset's (seed_presets.js), never the prompt's.
//
// The prompt text is what the model reads, so it stays English on purpose (§Q.11).
//
// A revised prompt reaches a database seeded before it through FEATURE_PROMPT_HEALS (the kit's featurePromptHeals,
// seed.js configureAppSeed): seeding is insert-if-missing, so each key lists the system texts it had, byte for byte, and
// a row still holding one of them — never edited — takes today's; an edited prompt is never touched. A system text can't
// change without its old text added there: tests/prompts.test.js holds today's fingerprints (the template's, since
// 2026-11-10). The schemes prompt is the same text from v0.1.0 to v0.2.0 (its fingerprint at each tag), so none yet.

import { SCHEMES_FEATURE, SCHEMES_PROMPT } from "./schemes_ai.js";

/** {action id: [earlier system texts, byte for byte]} — empty until a prompt is revised. */
export const FEATURE_PROMPT_HEALS = {};

export const DEFAULT_FEATURE_PROMPTS = {
  // Color schemes for a house: the variables are schemes_ai.js schemeVariables' (the house's
  // current colors, what is repainted, what stays, the owner's mood, how many). The answer is
  // JSON the server reads (parseSchemes).
  [SCHEMES_FEATURE]: {
    feature: SCHEMES_FEATURE,
    system: SCHEMES_PROMPT.system,
    user_template: SCHEMES_PROMPT.user,
    json_mode: true,
  },
};
