// SPDX-License-Identifier: MIT
// sd-cli: the argument list, the progress parser (on output recorded from a real run on the
// RTX 2070 SUPER) and the run's success / failure / cancel paths.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { buildArgs, DEFAULT_SD_RECIPE, runSdCli, SAMPLING_SPAN, SdCliError, SdProgress } from "../../src/aiphoto/sdcli.js";
import { fakeSpawn } from "./helpers.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const models = { diffusion: "m/flux.gguf", llm: "m/qwen.gguf", vae: "m/vae.safetensors" };

describe("buildArgs", () => {
  test("the measured recipe: -i + -r + --mask, strength 1, 4 steps, cfg 1, euler, offload", () => {
    const args = buildArgs({ models, init: "w/init.png", mask: "w/mask.png", prompt: "Repaint it", output: "w/out.png", width: 1024, height: 768 });
    expect(args).toEqual([
      "--diffusion-model",
      "m/flux.gguf",
      "--llm",
      "m/qwen.gguf",
      "--vae",
      "m/vae.safetensors",
      "-i",
      "w/init.png",
      "-r",
      "w/init.png",
      "--mask",
      "w/mask.png",
      "-p",
      "Repaint it",
      "-W",
      "1024",
      "-H",
      "768",
      "--steps",
      "4",
      "--cfg-scale",
      "1",
      "--strength",
      "1",
      "--sampling-method",
      "euler",
      "-s",
      "42",
      "--offload-to-cpu",
      "-v",
      "-o",
      "w/out.png",
    ]);
  });

  test("the recipe is data: a stored override and extra args", () => {
    const args = buildArgs({
      models,
      init: "i.png",
      ref: "r.png",
      mask: "m.png",
      prompt: "p",
      output: "o.png",
      width: 512,
      height: 384,
      recipe: { steps: 6, seed: 7, offloadToCpu: false, verbose: false, extraArgs: ["--vae-tiling"] },
    });
    expect(args.slice(args.indexOf("-r"), args.indexOf("-r") + 2)).toEqual(["-r", "r.png"]);
    expect(args[args.indexOf("--steps") + 1]).toBe("6");
    expect(args[args.indexOf("-s") + 1]).toBe("7");
    expect(args).not.toContain("--offload-to-cpu");
    expect(args).not.toContain("-v");
    expect(args.slice(-3)).toEqual(["--vae-tiling", "-o", "o.png"]);
    expect(Object.isFrozen(DEFAULT_SD_RECIPE)).toBe(true);
  });

  test("refuses a missing file or a size off the 16 grid", () => {
    expect(() => buildArgs({ models, init: "i", mask: "m", prompt: "p", output: "o", width: 1000, height: 768 })).toThrow(/multiple of 16/);
    expect(() => buildArgs({ models: { ...models, vae: "" }, init: "i", mask: "m", prompt: "p", output: "o", width: 16, height: 16 })).toThrow(
      /vae is required/,
    );
  });
});

/** The chunks one real run printed (tests/real.test.js records them). */
const recorded = () => JSON.parse(readFileSync(join(FIX, "sdcli-house1-red.chunks.json"), "utf8"));

describe("SdProgress", () => {
  test("a real run's output: monotonic, every sampling step seen, ends at the save mark", () => {
    const chunks = recorded();
    expect(chunks.some((c) => c.stream === "stdout")).toBe(true);
    const events = [];
    const p = new SdProgress((e) => events.push(e));
    for (const c of chunks) p.push(c.text, c.stream);
    p.end();
    const fr = events.map((e) => e.fraction);
    for (let i = 1; i < fr.length; i++) expect(fr[i]).toBeGreaterThan(fr[i - 1]);
    expect(events.filter((e) => e.stage === "sample" && e.steps === 4).map((e) => e.step)).toEqual([1, 2, 3, 4]);
    expect(events.map((e) => e.stage)).toEqual(expect.arrayContaining(["load", "encode", "condition", "sample", "decode", "save"]));
    expect(fr.at(-1)).toBe(0.99);
    expect(fr.every((f) => f > 0 && f <= 1)).toBe(true);
  });

  test("the same output split at every byte gives the same events", () => {
    const chunks = recorded();
    const whole = [];
    const p1 = new SdProgress((e) => whole.push(e));
    for (const c of chunks) p1.push(c.text, c.stream);
    p1.end();
    const bytes = [];
    const p2 = new SdProgress((e) => bytes.push(e));
    for (const c of chunks) for (const ch of c.text) p2.push(ch, c.stream);
    p2.end();
    expect(bytes).toEqual(whole);
  });

  test("tensor-loading bars (MB/s, GB/s) are not sampling steps", () => {
    const events = [];
    const p = new SdProgress((e) => events.push(e));
    p.push("  |####################       | 116/298 - 4.26GB/s\x1b[K  |######| 108/108 - 315.68MB/s\x1b[K\n");
    expect(events).toEqual([]);
    p.push("  |============>      | 1/4 - 4.26s/it\x1b[K");
    expect(events.at(-1)).toMatchObject({ stage: "sample", step: 1, steps: 4 });
    expect(events.at(-1).fraction).toBeCloseTo(SAMPLING_SPAN[0] + (SAMPLING_SPAN[1] - SAMPLING_SPAN[0]) / 4, 9);
  });

  test("a run that died mid-sampling stops at its last step", () => {
    const log = readFileSync(join(FIX, "sdcli-vram-taken.log"), "utf8");
    const events = [];
    const p = new SdProgress((e) => events.push(e));
    p.push(log, "stdout");
    p.end();
    expect(events.at(-1)).toMatchObject({ stage: "sample", step: 2, steps: 4 });
  });
});

describe("runSdCli", () => {
  test("success: progress flows, both streams are read, the job is closed", async () => {
    const fake = fakeSpawn({ chunks: existsSync(join(FIX, "sdcli-house1-red.chunks.json")) ? recorded() : [] });
    const events = [];
    const seen = { stdout: 0, stderr: 0 };
    await runSdCli("C:/sd/sd-cli.exe", ["-p", "x"], {
      onProgress: (e) => events.push(e),
      onOutput: (s) => seen[s]++,
      spawn: fake.spawn,
      close: fake.close,
    });
    expect(fake.calls[0].argv).toEqual(["C:/sd/sd-cli.exe", "-p", "x"]);
    expect(events.at(-1).fraction).toBe(0.99);
    expect(seen.stdout).toBeGreaterThan(0);
    expect(fake.closed).toContain(fake.calls[0].job);
  });

  test("a non-zero exit is an SdCliError carrying the last lines", async () => {
    const log = readFileSync(join(FIX, "sdcli-vram-taken.log"), "utf8");
    const fake = fakeSpawn({ chunks: [{ stream: "stdout", text: log }], code: 1 });
    const err = await runSdCli("sd-cli", [], { spawn: fake.spawn, close: fake.close }).catch((e) => e);
    expect(err).toBeInstanceOf(SdCliError);
    expect(err.code).toBe(1);
    expect(err.message).toMatch(/exit 1/);
    expect(err.message).toMatch(/generate failed/);
    expect(err.tail).toMatch(/cannot make enough memory available/);
  });

  test("abort kills the process, closes its job and rejects with the AbortError", async () => {
    const fake = fakeSpawn({
      chunks: [
        { stream: "stdout", text: "[I] loading diffusion model from 'x' --- diffusion_engine.cpp:738\n" },
        { stream: "stdout", text: "  |============>      | 1/4 - 4.26s/it\x1b[K" },
        { stream: "stdout", text: "never printed" },
      ],
      pauseAfter: 2,
    });
    const ac = new AbortController();
    const run = runSdCli("sd-cli", [], {
      signal: ac.signal,
      spawn: fake.spawn,
      close: fake.close,
      onProgress: (e) => {
        if (e.stage === "sample") ac.abort();
      },
    });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.calls[0].proc.killedWith).toBe("SIGKILL");
    expect(fake.closed).toContain(fake.calls[0].job);
  });

  test("an already-aborted signal never starts the process", async () => {
    const fake = fakeSpawn();
    const ac = new AbortController();
    ac.abort();
    await expect(runSdCli("sd-cli", [], { signal: ac.signal, spawn: fake.spawn })).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.calls).toHaveLength(0);
  });

  test("cancel kills a REAL child started through the kit's spawnChild", async () => {
    // A stand-in for sd-cli: this runtime as Node, printing a sampling bar, then idling.
    const script = "process.stdout.write('  |====>   | 1/4 - 2.61s/it\\x1b[K'); setInterval(() => {}, 1000);";
    const ac = new AbortController();
    let pid = null;
    const t0 = Date.now();
    const run = runSdCli(process.execPath, ["-e", script], {
      signal: ac.signal,
      onProgress: () => ac.abort(),
      spawn: async (popen, argv, logPath) => {
        const { spawnChild } = await import("@delebash/core/runner/process");
        const out = await spawnChild(popen, argv, logPath);
        pid = out[0].pid;
        return out;
      },
    });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid, 0)).toThrow(); // gone
  });
});
