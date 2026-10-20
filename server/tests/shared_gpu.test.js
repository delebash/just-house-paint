// SPDX-License-Identifier: MIT
// The AI photo's note on other programs, through the real wiring (services.js): the kit's measurement
// (hardware.otherGpuHolders), the setting's floor (aiphoto.sharedGpuNoteMb), 0 turning it off, and
// an unmeasurable machine saying nothing.
import * as hardware from "@delebash/core/runner/hardware";
import { afterEach, expect, test, vi } from "vitest";
import { openAppDatabase } from "../src/database/index.js";
import { seedSettings } from "../src/database/seed.js";
import { setSetting } from "../src/database/settings.js";
import { createServices } from "../src/services.js";
import { tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

const open = [];
afterEach(() => {
  for (const db of open.splice(0)) db.close();
  vi.restoreAllMocks();
});

test("other programs are named above the setting's floor, never at 0, never when unmeasurable", async () => {
  const db = openAppDatabase(tmpDir());
  open.push(db);
  seedSettings(db);
  const services = createServices({ db, dataDir: tmpDir() });
  const holders = vi.spyOn(hardware, "otherGpuHolders").mockResolvedValue([{ label: "llama-server", memMb: 6900, pid: 1, name: "llama-server" }]);
  expect(await services.sharedGpu()).toEqual({ mb: 6900, programs: ["llama-server"], more: 0 });
  setSetting(db, "aiphoto.sharedGpuNoteMb", 8000); // above what they hold
  expect(await services.sharedGpu()).toBeNull();
  setSetting(db, "aiphoto.sharedGpuNoteMb", 0); // the note turned off: not even measured
  holders.mockClear();
  expect(await services.sharedGpu()).toBeNull();
  expect(holders).not.toHaveBeenCalled();
  setSetting(db, "aiphoto.sharedGpuNoteMb", 1024);
  holders.mockResolvedValue(null); // unmeasurable here
  expect(await services.sharedGpu()).toBeNull();
  holders.mockRejectedValue(new Error("typeperf failed"));
  expect(await services.sharedGpu()).toBeNull();
});
