// SPDX-License-Identifier: MIT
// The house-parts recipe: SAM 3 text prompts per part over one encoded photo, and the body (siding /
// walls) by SUBTRACTION — the main "house" instance minus every other part found. Probe round 2
// (just-house-paint RESEARCH §10): "house" minus the parts covers all the siding, gables included,
// which "exterior wall" and "siding" missed; "house" can also match a neighbor's house, so only the
// main instance is used.
//
// The parts list is DATA (the app seeds it into its database): `[{ key, labelKey, prompts, threshold,
// paintable, group, method }]`, method "text" (default — the union of what the prompts find) or
// "subtract" (at most one part: the main instance its prompts find, minus every other part).
import { dedupeInstances, dilateMask, intersectMask, maskArea, subtractMask, unionMasks } from "./masks.js";

export const DEFAULT_PARTS = Object.freeze(
  [
    { key: "body", labelKey: "parts.body", prompts: ["house"], threshold: 0.5, paintable: true, group: "walls", method: "subtract" },
    // "fascia" catches the rake boards plain "trim" misses (RESEARCH §11); 0.35 alone took a road's painted
    // line. The window casings are their own part (windowTrim) since 2026-10-18
    { key: "trim", labelKey: "parts.trim", prompts: ["trim", "fascia"], threshold: 0.4, paintable: true, group: "trim" },
    { key: "frontDoor", labelKey: "parts.frontDoor", prompts: ["door"], threshold: 0.5, paintable: true, group: "doors" },
    { key: "garageDoor", labelKey: "parts.garageDoor", prompts: ["garage door"], threshold: 0.5, paintable: true, group: "doors" },
    { key: "shutters", labelKey: "parts.shutters", prompts: ["shutter"], threshold: 0.5, paintable: true, group: "accents" },
    { key: "columns", labelKey: "parts.columns", prompts: ["column"], threshold: 0.5, paintable: true, group: "trim" },
    { key: "railings", labelKey: "parts.railings", prompts: ["railing"], threshold: 0.5, paintable: true, group: "trim" },
    { key: "gutters", labelKey: "parts.gutters", prompts: ["gutter"], threshold: 0.5, paintable: true, group: "trim" },
    // SAM 3 doesn't know "soffit" or "eaves" (no hits on four photos); "roof overhang" finds the overhang's
    // boards — soffit and fascia, as the street sees them — with no false hit down to 0.3 (RESEARCH §11)
    { key: "soffit", labelKey: "parts.soffit", prompts: ["roof overhang"], threshold: 0.3, paintable: true, group: "trim" },
    // "window trim" finds whole windows; the windows part keeps the glass, this keeps the casings and frames
    // around them. 0.5, not 0.4: at 0.48 it outlined a parked car's window (RESEARCH §11)
    { key: "windowTrim", labelKey: "parts.windowTrim", prompts: ["window trim"], threshold: 0.5, paintable: true, group: "trim" },
    { key: "chimney", labelKey: "parts.chimney", prompts: ["chimney"], threshold: 0.5, paintable: true, group: "walls" },
    { key: "roof", labelKey: "parts.roof", prompts: ["roof"], threshold: 0.5, paintable: false, group: "roof" },
    { key: "windows", labelKey: "parts.windows", prompts: ["window"], threshold: 0.5, paintable: false, group: "windows" },
    { key: "stone", labelKey: "parts.stone", prompts: ["stone wall"], threshold: 0.5, paintable: false, group: "masonry" },
    { key: "brick", labelKey: "parts.brick", prompts: ["brick wall"], threshold: 0.5, paintable: false, group: "masonry" },
    { key: "lamps", labelKey: "parts.lamps", prompts: ["lamp"], threshold: 0.5, paintable: false, group: "fixtures" },
  ].map((p) => Object.freeze({ ...p, prompts: Object.freeze([...p.prompts]) })),
);
export default DEFAULT_PARTS;

const METHODS = ["text", "subtract"];

/** Check a parts list and return it normalized (threshold 0.5 and method "text" when absent).
 * Throws a TypeError naming the first bad entry. */
export function validatePartsConfig(config) {
  if (!Array.isArray(config) || config.length === 0) throw new TypeError("the parts config must be a non-empty array");
  const keys = new Set();
  let subtract = 0;
  return config.map((p, i) => {
    const where = `parts[${i}]${p && typeof p.key === "string" ? ` (${p.key})` : ""}`;
    const bad = (why) => new TypeError(`${where}: ${why}`);
    if (!p || typeof p !== "object") throw bad("must be an object");
    if (typeof p.key !== "string" || !p.key.trim()) throw bad("key must be a non-empty string");
    if (keys.has(p.key)) throw bad(`duplicate key "${p.key}"`);
    keys.add(p.key);
    if (typeof p.labelKey !== "string" || !p.labelKey.trim()) throw bad("labelKey must be a non-empty string");
    if (!Array.isArray(p.prompts) || p.prompts.length === 0) throw bad("prompts must be a non-empty array");
    for (const q of p.prompts) if (typeof q !== "string" || !q.trim()) throw bad("every prompt must be a non-empty string");
    const threshold = p.threshold ?? 0.5;
    if (typeof threshold !== "number" || !(threshold > 0 && threshold < 1)) throw bad("threshold must be a number between 0 and 1");
    if (typeof p.paintable !== "boolean") throw bad("paintable must be true or false");
    if (typeof p.group !== "string" || !p.group.trim()) throw bad("group must be a non-empty string");
    const method = p.method ?? "text";
    if (!METHODS.includes(method)) throw bad(`method must be ${METHODS.map((m) => `"${m}"`).join(" or ")}`);
    if (method === "subtract" && ++subtract > 1) throw bad('only one part can use method "subtract"');
    return { ...p, prompts: [...p.prompts], threshold, method };
  });
}

/**
 * The main house among several "house" instances: the largest mask, weighted by how central it is —
 * rank = area × (1 − d), d = distance from the mask's centroid to the photo's centre ÷ half the
 * diagonal. A neighbor's house at the edge loses to the one the photo is framed on.
 * Instances: `{ mask, area? }` full-size. Returns the instance (or null for none).
 */
export function pickMainInstance(instances, width, height) {
  let best = null;
  let bestRank = -1;
  const halfDiag = Math.hypot(width, height) / 2;
  for (const inst of instances) {
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (inst.mask[row + x]) {
          n++;
          sx += x;
          sy += y;
        }
      }
    }
    if (!n) continue;
    const d = Math.hypot(sx / n - width / 2, sy / n - height / 2) / halfDiag;
    const rank = n * Math.max(0, 1 - d);
    if (rank > bestRank) {
      bestRank = rank;
      best = inst;
    }
  }
  return best;
}

/**
 * Find every part of `partsConfig` on an encoded photo. `segmenter` needs `findText(handle, phrase,
 * { threshold })`. Options: `onProgress({ part, phrase, index, total })` before each prompt, `signal`
 * (an AbortSignal, checked between prompts).
 * Returns `{ width, height, parts: [{ key, mask, area, score, instances }], timings }` in config
 * order; a part nothing was found for has `mask: null, area: 0, score: 0, instances: []`.
 * `timings`: `{ prompts: [{ part, phrase, ms, found }], combineMs, totalMs }`.
 */
/**
 * Parts stay on the house ("door" found a parked SUV's doors on a user's photo, 2026-10-18). The
 * house is the union of what the "subtract" part's prompts found ("house"), grown by `houseMargin`
 * (a fraction of the photo's longer side; 0 = off) so the trim and gutters on its outline count.
 * Each instance a part's prompts find is kept only when at least `houseMinShare` of it lies on the
 * house — a car in front of the garage sits inside the house's outline, so clipping pixels alone
 * kept part of its door — and what is kept is clipped to the house.
 */
export async function findParts(
  segmenter,
  handle,
  partsConfig = DEFAULT_PARTS,
  { onProgress, signal, houseMargin = 0, houseMinShare = 0.5 } = {},
) {
  const config = validatePartsConfig(partsConfig);
  const { width, height } = handle;
  const t0 = performance.now();
  const timings = { prompts: [], combineMs: 0, totalMs: 0 };
  const total = config.reduce((n, p) => n + p.prompts.length, 0);
  const found = new Map();
  let index = 0;
  for (const part of config) {
    let instances = [];
    for (const phrase of part.prompts) {
      signal?.throwIfAborted();
      onProgress?.({ part: part.key, phrase, index: index++, total });
      const tp = performance.now();
      const got = await segmenter.findText(handle, phrase, { threshold: part.threshold });
      timings.prompts.push({ part: part.key, phrase, ms: Math.round(performance.now() - tp), found: got.length });
      for (const inst of got) instances.push({ ...inst, prompt: phrase });
    }
    if (part.prompts.length > 1) instances = dedupeInstances(instances, width, height);
    found.set(part.key, instances);
  }

  const ts = performance.now();
  const n = width * height;
  const textUnion = unionMasks(
    config.filter((p) => p.method === "text").flatMap((p) => found.get(p.key).map((i) => i.mask)),
    n,
  );
  // the house's area: every instance the "subtract" part's prompts found, grown by the margin
  const houseInstances = config.filter((p) => p.method === "subtract").flatMap((p) => found.get(p.key));
  const houseArea =
    houseMargin > 0 && houseInstances.length
      ? dilateMask(unionMasks(houseInstances.map((i) => i.mask), n), width, height, Math.round(houseMargin * Math.max(width, height)))
      : null;
  const onHouse = (mask) => (houseArea ? intersectMask(mask, houseArea) : mask);
  const mostlyOnHouse = (inst) => {
    if (!houseArea) return true;
    let all = 0;
    let on = 0;
    for (let i = 0; i < inst.mask.length; i++) {
      if (!inst.mask[i]) continue;
      all++;
      if (houseArea[i]) on++;
    }
    return all > 0 && on / all >= houseMinShare;
  };

  const parts = config.map((part) => {
    const instances = found.get(part.key);
    if (part.method === "subtract") {
      const main = pickMainInstance(instances, width, height);
      if (!main) return { key: part.key, mask: null, area: 0, score: 0, instances: [] };
      const mask = subtractMask(main.mask, textUnion);
      return { key: part.key, mask, area: maskArea(mask), score: main.score, instances: [main] };
    }
    const kept = instances.filter(mostlyOnHouse);
    if (!kept.length) return { key: part.key, mask: null, area: 0, score: 0, instances: [] };
    const mask = onHouse(unionMasks(kept.map((i) => i.mask), n));
    return { key: part.key, mask, area: maskArea(mask), score: Math.max(...kept.map((i) => i.score)), instances: kept };
  });
  timings.combineMs = Math.round(performance.now() - ts);
  timings.totalMs = Math.round(performance.now() - t0);
  return { width, height, parts, timings };
}
