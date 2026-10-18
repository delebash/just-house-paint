// SPDX-License-Identifier: MIT
// AI color-scheme suggestions (the feature `schemes.suggest`, PRD F6): the server reads the house's
// current colors from its photo and parts (the median color inside each part's mask), asks the
// AI for schemes as JSON through the kit's run path (the preset routed to this feature — local
// llama.cpp or the user's cloud key), then snaps every color to the nearest real paint of the
// chosen brand. A prompt-row-owned feature (app-structure §11, "prompt ownership"): its system
// and user templates are the kit's `feature_prompts` row (seed_feature_prompts.js, seeded from
// SCHEMES_PROMPT), edited and tried in the AI Lab; this code fills the row's {{variables}}.

import { displayName, nearestPaints } from "./paints/index.js";

export const SCHEMES_FEATURE = "schemes.suggest";

// What the AI reads stays English on purpose (app-structure §Q.11) — a prompt, not screen text.
// The variables are schemeVariables'. The prompt row asks for JSON (json_mode).
export const SCHEMES_PROMPT = Object.freeze({
  system:
    "You are an exterior color consultant. You suggest paint color schemes for houses that look good with the parts that won't be repainted. You know the house only from the parts and colors listed: base each reason on them, and don't describe materials, textures or details that aren't listed. In the reasons, name colors in plain words (\"the dark roof\"), never as hex codes. You answer with JSON only.",
  user: [
    "The house, as its photo shows it (each part's current color):",
    "{{current}}",
    "",
    "These parts will be repainted: {{paintable}}.",
    "These stay as they are: {{fixed}}.",
    "{{mood}}",
    "",
    "Suggest {{count}} different exterior color schemes. For each: a short name (2–4 words), the body,",
    "trim and accent (front door) colors as #rrggbb hex, and one sentence on why it suits this house.",
    'Answer as JSON: {"schemes":[{"name":"…","body":"#rrggbb","trim":"#rrggbb","accent":"#rrggbb","why":"…"}]}',
  ].join("\n"),
});

const toHex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** The median color of the photo's pixels (RGBA) inside a mask; null when the mask is empty. */
export function medianColor(rgba, mask) {
  const rs = [];
  const gs = [];
  const bs = [];
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (mask[i] < 128) continue;
    rs.push(rgba[p]);
    gs.push(rgba[p + 1]);
    bs.push(rgba[p + 2]);
  }
  if (!rs.length) return null;
  const med = (a) => {
    a.sort((x, y) => x - y);
    return a[a.length >> 1];
  };
  return toHex(med(rs), med(gs), med(bs));
}

/**
 * The facts the prompt reads: each found part's current color and how much of the house it
 * covers. `parts`: [{ key, paintable, area }]; `masks`: { key: Uint8Array }; `labelOf(key)` the
 * part's English name.
 */
export function houseFacts({ rgba, parts, masks, labelOf = (k) => k.replace(/_/g, " ") }) {
  const total = parts.reduce((n, p) => n + (p.area || 0), 0) || 1;
  const rows = [];
  for (const p of parts) {
    const mask = masks[p.key];
    if (!mask || !p.area) continue;
    const hex = medianColor(rgba, mask);
    if (hex) rows.push({ key: p.key, label: labelOf(p.key), paintable: p.paintable, hex, share: p.area / total });
  }
  return rows;
}

/** The template variables for a set of facts. */
export function schemeVariables(facts, { mood = "", count = 3 } = {}) {
  const pct = (s) => `${Math.max(1, Math.round(s * 100))}%`;
  return {
    current: facts.map((f) => `- ${f.label}: ${f.hex} (about ${pct(f.share)} of the house)`).join("\n") || "- (no parts found yet)",
    paintable: facts.filter((f) => f.paintable).map((f) => f.label).join(", ") || "the body, the trim and the front door",
    fixed: facts.filter((f) => !f.paintable).map((f) => `${f.label} ${f.hex}`).join(", ") || "nothing named",
    mood: mood ? `The owner would like: ${mood}` : "",
    count: String(count),
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

/** The schemes in the AI's answer: JSON (code fences and prose around it tolerated). */
export function parseSchemes(text) {
  const s = String(text || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("the AI's answer holds no JSON");
  let data;
  try {
    data = JSON.parse(s.slice(start, end + 1));
  } catch {
    throw new Error("the AI's answer isn't valid JSON");
  }
  const list = Array.isArray(data?.schemes) ? data.schemes : Array.isArray(data) ? data : [];
  const out = [];
  for (const x of list) {
    const roles = ["body", "trim", "accent"].map((r) => String(x?.[r] || "").trim());
    if (!roles.every((h) => HEX.test(h))) continue;
    out.push({ name: String(x.name || "").trim().slice(0, 60) || "Scheme", body: roles[0], trim: roles[1], accent: roles[2], why: String(x.why || "").trim().slice(0, 300) });
  }
  if (!out.length) throw new Error("the AI's answer has no usable scheme (each needs body, trim and accent as #rrggbb)");
  return out;
}

/** A scheme's colors snapped to the brand's nearest real paints (exterior ones when known). */
export function snapScheme(scheme, paints, { brand, exteriorOnly = true } = {}) {
  const used = new Set();
  const role = (target) => {
    const near = nearestPaints(target, paints, { k: 4, brand, exteriorOnly });
    const pick = near.find((n) => !used.has(n.paint.id)) || near[0];
    if (!pick) return { target, paint: null, deltaE: null };
    used.add(pick.paint.id);
    return { target, deltaE: pick.deltaE, paint: { id: pick.paint.id, displayName: displayName(pick.paint), hex: pick.paint.hex, brand: pick.paint.brand } };
  };
  const roles = { body: role(scheme.body), trim: role(scheme.trim), accent: role(scheme.accent) };
  return { kind: "ai", name: scheme.name, why: scheme.why, complete: Object.values(roles).every((r) => r.paint), notes: [], roles };
}

/**
 * Ask the AI. `run({ action, variables })` is the kit's run path (runAction: the feature's prompt
 * row and engine preset) → an LLMResponse. Returns { schemes, usage, model }.
 */
export async function suggestWithAi({ run, facts, paints, brand, mood, count = 3 }) {
  const resp = await run({ action: SCHEMES_FEATURE, variables: schemeVariables(facts, { mood, count }) });
  const schemes = parseSchemes(resp.text).map((s) => snapScheme(s, paints, { brand }));
  return { schemes, model: resp.model, usage: { prompt_tokens: resp.prompt_tokens || 0, completion_tokens: resp.completion_tokens || 0 } };
}
