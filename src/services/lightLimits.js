// SPDX-License-Identifier: MIT
// The limits the screen reads a part's light with ("On it now" — server/src/shared/light.js): the setting
// aiphoto.compose's gainLimits, castLimit and signalFloor, the same the AI photo locks its colors with. The settings
// store hands them over each time it reads or saves the settings (stores/settings.js); the painter reads them at
// each paint (services/painter.js) and Save image sends them to its worker (services/fullSizeImage.js) — a plain
// module, no store, so the worker can load the painter too. The setting's first values until the settings are read.
import { lightLimitsOf } from "just-house-paint-server/shared/light.js";

let current = lightLimitsOf();

/** The limits now (one object until the setting changes — a painter keys its cached light on it). */
export const lightLimits = () => current;

/** The setting aiphoto.compose read (or saved): its light limits from now on. */
export function setLightLimits(compose) {
  current = lightLimitsOf(compose);
  return current;
}
