// SPDX-License-Identifier: MIT
// The part finder's install figure: only what is still missing — the files here at their full size
// don't count (the install card once said 3.1 GB for a 2 MB download).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { createFinder } from "../src/finder.js";
import { MODEL_FILES } from "../src/segment/models.js";

const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("the files here at their full size are not counted; a short one is", () => {
  const modelDir = mkdtempSync(path.join(os.tmpdir(), "hp-finder-"));
  dirs.push(modelDir);
  const total = MODEL_FILES.reduce((n, f) => n + f.size, 0);
  const finder = createFinder({ dataDir: modelDir, modelDir, idleMs: () => 60_000, partsConfig: () => null, priority: () => null });
  expect(finder.downloadBytes()).toBe(total);

  const small = MODEL_FILES.filter((f) => f.size < 10_000);
  expect(small.length).toBeGreaterThan(0);
  for (const f of small) writeFileSync(path.join(modelDir, f.name), Buffer.alloc(f.size));
  expect(finder.downloadBytes()).toBe(total - small.reduce((n, f) => n + f.size, 0));

  // a file cut short still counts whole
  writeFileSync(path.join(modelDir, small[0].name), Buffer.alloc(small[0].size - 1));
  expect(finder.downloadBytes()).toBe(total - small.slice(1).reduce((n, f) => n + f.size, 0));
});
