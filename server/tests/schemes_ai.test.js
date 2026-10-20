// SPDX-License-Identifier: MIT
// AI color schemes (schemes.suggest): the house's facts, the AI's JSON, every color snapped to a
// real paint, and the refusals (no paints, no parts, no AI set up, an unusable answer).
import { afterEach, describe, expect, test } from "vitest";
import { medianColor, parseSchemes, schemeVariables } from "../src/schemes_ai.js";
import { assertGpuFree } from "../src/jobs.js";
import { aiAnswer, jpeg, makeServer } from "./domain_helpers.js";
import { syntheticPalette } from "./paints/fixtures/palette.js";

let s;
afterEach(() => {
  s?.close();
  aiAnswer.text = "{}";
  aiAnswer.error = null;
  aiAnswer.calls.length = 0;
  aiAnswer.hang = false;
  aiAnswer.aborted = 0;
});

describe("the pieces", () => {
  test("the median color inside a mask", () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 200, 100, 50, 255, 12, 22, 32, 255]);
    expect(medianColor(rgba, new Uint8Array([255, 0, 255]))).toBe("#0c1620");
    expect(medianColor(rgba, new Uint8Array([0, 0, 0]))).toBeNull();
  });

  test("the prompt's variables say what is painted and what stays", () => {
    const v = schemeVariables(
      [
        { label: "body", paintable: true, hex: "#e0d4b5", share: 0.6 },
        { label: "roof", paintable: false, hex: "#333333", share: 0.3 },
      ],
      { mood: "warm and calm", count: 2 },
    );
    expect(v.current).toBe("- body: #e0d4b5 (about 60% of the house)\n- roof: #333333 (about 30% of the house)");
    expect(v.paintable).toBe("body");
    expect(v.fixed).toBe("roof #333333");
    expect(v.mood).toBe("The owner would like: warm and calm");
    expect(v.count).toBe("2");
  });

  test("the AI's JSON is read through fences and prose; bad schemes are skipped", () => {
    const text = 'Sure!\n```json\n{"schemes":[{"name":"Sea Breeze","body":"#7fa3b5","trim":"#f4f1e8","accent":"#8b2e2e","why":"Calm."},{"name":"Bad","body":"blue"}]}\n```';
    expect(parseSchemes(text)).toEqual([{ name: "Sea Breeze", body: "#7fa3b5", trim: "#f4f1e8", accent: "#8b2e2e", why: "Calm." }]);
    expect(() => parseSchemes("no json here")).toThrow(/holds no JSON/);
    // a bare list, prose with a "[" before it and a "}" after it (the twenty-first review: both failed)
    const one = { name: "Dune", body: "#e8dcc8", trim: "#ffffff", accent: "#2f4a3a", why: "Warm." };
    expect(parseSchemes(JSON.stringify([one]))).toEqual([one]);
    expect(parseSchemes(`Here [as asked]:\n${JSON.stringify({ schemes: [one] })}\nEnjoy } these.`)).toEqual([one]);
    expect(parseSchemes(`\`\`\`json\n${JSON.stringify([one])}\n\`\`\``)).toEqual([one]);
    // a brace inside a string doesn't close it
    expect(parseSchemes(JSON.stringify({ schemes: [{ ...one, why: "a } inside" }] }))[0].why).toBe("a } inside");
    expect(() => parseSchemes("{ not json }")).toThrow(/isn't valid JSON/);
    expect(() => parseSchemes('{"schemes":[{"name":"x","body":"#123456"}]}')).toThrow(/no usable scheme/);
  });
});

describe("POST /v1/schemes/ai", () => {
  async function houseWithParts(withPaints = true) {
    s = makeServer();
    const house = await (await s.upload(await jpeg(400, 300))).json();
    await s.settle((await (await s.json("POST", `/v1/houses/${house.id}/find-parts`)).json()).id);
    if (withPaints) {
      const rows = syntheticPalette({ brand: "behr" });
      const csv = ["code,name,hex,exterior", ...rows.map((r) => `${r.code},${r.name},${r.hex},yes`)].join("\n");
      const form = new FormData();
      form.append("file", new Blob([csv]), "t.csv");
      form.append("brand", "behr");
      await s.app.request("/v1/paints/import", { method: "POST", body: form });
    }
    return house;
  }

  test("the house's current colors go to the AI; every color comes back as a real paint", async () => {
    const house = await houseWithParts();
    aiAnswer.text = JSON.stringify({
      schemes: [
        { name: "Harbor", body: "#5b7a8c", trim: "#f2efe6", accent: "#a33a2f", why: "Cool body, crisp trim." },
        { name: "Sand", body: "#d8c7a3", trim: "#ffffff", accent: "#2f4a3a", why: "Warm and light." },
      ],
    });
    const r = await s.json("POST", "/v1/schemes/ai", { houseId: house.id, brand: "behr", mood: "coastal" });
    expect(r.status).toBe(200);
    const out = await r.json();
    expect(out.usage).toEqual({ prompt_tokens: 120, completion_tokens: 80 });
    expect(out.schemes.map((x) => x.name)).toEqual(["Harbor", "Sand"]);
    for (const sc of out.schemes) {
      expect(sc.complete).toBe(true);
      for (const role of ["body", "trim", "accent"]) expect(sc.roles[role].paint.id).toMatch(/^behr:/);
    }
    const call = aiAnswer.calls[0];
    expect(call).toMatchObject({ action: "schemes.suggest" });
    expect(call.variables.current).toContain("- body: #");
    expect(call.variables.fixed).toBe("nothing named"); // the fake roof covers no pixels
    expect(call.variables.mood).toBe("The owner would like: coastal");
  });

  test("beside a running AI photo, the schemes wait only when they would run on the local model", async () => {
    const house = await houseWithParts();
    aiAnswer.text = JSON.stringify({ schemes: [{ name: "Harbor", body: "#5b7a8c", trim: "#f2efe6", accent: "#a33a2f" }] });
    s.ctx.jobs.start({ kind: "aiphoto", key: house.id, label: "Main street" }, () => new Promise(() => {}));
    s.ctx.usesLocalAi = () => false; // a cloud model: nothing to load on the card
    expect((await s.json("POST", "/v1/schemes/ai", { houseId: house.id, brand: "behr" })).status).toBe(200);
    s.ctx.usesLocalAi = (feature) => feature === "schemes.suggest";
    const busy = await s.json("POST", "/v1/schemes/ai", { houseId: house.id, brand: "behr" });
    expect(busy.status).toBe(409);
    expect((await busy.json()).type).toMatch(/gpu-busy$/);
    s.ctx.jobs.cancelAll();
  });

  test("Cancel in the window stops the model's run and frees the local AI for the AI photo (the twenty-first review)", async () => {
    const house = await houseWithParts();
    s.ctx.usesLocalAi = (feature) => feature === "schemes.suggest";
    aiAnswer.hang = true;
    const cancel = new AbortController();
    const asked = s.app.request("/v1/schemes/ai", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost" },
      body: JSON.stringify({ houseId: house.id, brand: "behr" }),
      signal: cancel.signal,
    });
    await new Promise((r) => setTimeout(r, 50));
    // while it runs, the local AI is held: an AI photo waits
    expect(() => assertGpuFree(s.ctx.jobs, "aiphoto")).toThrow(/AI color schemes are being made/);
    cancel.abort();
    const answer = await asked.catch((e) => e);
    expect(aiAnswer.aborted).toBe(1);
    expect(answer?.status ?? 499).toBe(499);
    // let go: the AI photo can run
    expect(() => assertGpuFree(s.ctx.jobs, "aiphoto")).not.toThrow();
  });

  test("it needs the brand's colors and the house's parts", async () => {
    const house = await houseWithParts(false);
    expect((await s.json("POST", "/v1/schemes/ai", { houseId: house.id, brand: "behr" })).status).toBe(409);
    s.close();
    s = makeServer();
    const bare = await (await s.upload(await jpeg(100, 80))).json();
    expect((await s.json("POST", "/v1/schemes/ai", { houseId: bare.id, brand: "behr" })).status).toBe(409);
    expect((await s.json("POST", "/v1/schemes/ai", { houseId: bare.id, brand: "" })).status).toBe(422);
  });

  test("no AI set up is a 501; an unusable answer a 502", async () => {
    const house = await houseWithParts();
    aiAnswer.error = Object.assign(new Error("no provider"), { name: "LLMNotConfiguredError" });
    expect((await s.json("POST", "/v1/schemes/ai", { houseId: house.id, brand: "behr" })).status).toBe(501);
    aiAnswer.error = null;
    aiAnswer.text = "I can't help with that.";
    const bad = await s.json("POST", "/v1/schemes/ai", { houseId: house.id, brand: "behr" });
    expect(bad.status).toBe(502);
    expect((await bad.json()).type).toMatch(/ai-answer-unusable$/);
    // a model it can't reach: the local engine not ready (503, with why), the provider unreachable (502) — as the kit's
    // /v1/ai/run answers (the twentieth review: both 500s)
    aiAnswer.error = Object.assign(new Error("the AI engine isn't installed — install it first (AI Settings)"), { localNotReady: true });
    const notReady = await s.json("POST", "/v1/schemes/ai", { houseId: house.id, brand: "behr" });
    expect(notReady.status).toBe(503);
    expect(await notReady.json()).toMatchObject({ type: expect.stringMatching(/engine-not-ready$/), detail: expect.stringMatching(/isn't installed/) });
    aiAnswer.error = Object.assign(new Error("fetch failed"), { unreachable: true });
    expect((await s.json("POST", "/v1/schemes/ai", { houseId: house.id, brand: "behr" })).status).toBe(502);
    aiAnswer.error = null;
  });

});

test("an AI scheme's name and reason are cut between characters, never inside an emoji", () => {
  const name = `${"a".repeat(59)}🏠 more`;
  const [s] = parseSchemes(JSON.stringify({ schemes: [{ name, body: "#112233", trim: "#445566", accent: "#778899", why: "x" }] }));
  expect(s.name).toBe("a".repeat(59)); // the house would have been half a surrogate at 60
  expect(s.name).not.toMatch(/[\uD800-\uDBFF]$/);
});
