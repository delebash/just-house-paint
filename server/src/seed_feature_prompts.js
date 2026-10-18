// SPDX-License-Identifier: MIT
// The default prompt of each AI action (app-structure §8, §11: a "prompt-row-owned" feature) —
// seeded into the shared `feature_prompts` table insert-if-missing, then read from the database
// on every run, so the AI Lab can edit and save it. Keyed by the ACTION id; each row names its
// routing `feature`, the `system` prompt, the `user_template` ({{var}} placeholders the caller
// fills — runAiFeature's `variables`) and its JSON contract (`json_mode`). Every tunable is the
// engine preset's (seed_presets.js), never the prompt's.
//
// The prompt text is what the model reads, so it stays English on purpose (§Q.11).

import { SCHEMES_FEATURE, SCHEMES_PROMPT } from "./schemes_ai.js";

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
