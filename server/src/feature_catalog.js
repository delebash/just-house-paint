// SPDX-License-Identifier: MIT
// The app's AI features — what AI Settings → "Routing by feature" lists (app-structure §8), handed
// to installLlm. Each feature's ACTION points at an engine preset (seed_presets.js
// DEFAULT_FEATURE_PRESETS) that owns the provider, the model and every tunable; its prompt row is
// seed_feature_prompts.js. A feature is registered the day it calls the engine — a routing row
// for a feature that can't route is a lie (§11).
//
// `label` and `hint` are the words the user meets (the copy law, §11): outcomes, never internal
// terms. They are database seed data, English for now (§11: vue-i18n can't reach seeded rows yet).

import { FeatureCatalogEntry } from "@delebash/core/llm";

export const FEATURE_CATALOG = [
  // The house page's "Ask the AI" color schemes (POST /v1/schemes/ai, run in the server through the
  // kit's runAction — the server reads the house's colors and snaps the answer to real paints): the
  // action key is the feature key, so the Workbench shows this label for it.
  FeatureCatalogEntry({
    key: "schemes.suggest",
    label: "Suggest color schemes",
    hint: "Suggests exterior color schemes that suit the house's roof, stone and other parts that stay — Ask the AI on a house's Schemes tab.",
    group: "Color schemes",
  }),
];
