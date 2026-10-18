// SPDX-License-Identifier: MIT
// stable-diffusion.cpp's `sd-cli`: the measured recipe as DATA, the argument list, the
// progress parser and the run (cancellable).
//
// The recipe is just-house-paint RESEARCH §10 "Probe round 2 — masked AI": `-i` + `-r` + `--mask`
// (the photo as both init and reference image), strength 1.0, 4 steps, cfg 1, euler,
// `--offload-to-cpu` — 18.4 s and 6.41 GB on the RTX 2070 SUPER at 1024×768.
//
// Output streams (sd.cpp examples/common/log.cpp `log_print`, commit f0aac52): every log line
// goes to STDOUT except [E] errors, which go to STDERR; ggml's CUDA init lines go to stderr.
// The progress bars are stdout lines ending in ESC[K. The parser therefore reads BOTH streams.
//
// Spawning goes through the kit's one native-runtime spawn seam, `spawnChild` (Windows
// kill-on-close Job Object, virus-scanner retry; @delebash/core runner/process.js) — the
// sd-cli child dies with the server. Cancel = AbortSignal → kill + close the job.

import { dirname } from "node:path";
import { StringDecoder } from "node:string_decoder";
import * as procs from "@delebash/core/platform/procs";
import { closeJob, spawnChild } from "@delebash/core/runner/process";

/** The measured recipe — DATA the app seeds into its database (editable there). */
export const DEFAULT_SD_RECIPE = Object.freeze({
  steps: 4,
  cfgScale: 1.0,
  strength: 1.0,
  samplingMethod: "euler",
  seed: 42,
  offloadToCpu: true,
  verbose: true, // `-v`: the [V] stage lines the progress parser also reads
  extraArgs: Object.freeze([]), // appended verbatim (e.g. "--vae-tiling" for a smaller card)
});

/**
 * How far along a run is when sd-cli prints each stage line (fractions of the measured 18.4 s
 * run: ~1.9 s loading before generate_image, VAE encode 1.4 s, text encoder ~1.9 s, 4 steps
 * 12.1 s, decode 1.1 s). DATA; the sampling bar fills SAMPLING_SPAN step by step.
 */
export const PROGRESS_MARKS = Object.freeze([
  Object.freeze({ match: "loading diffusion model", fraction: 0.01, stage: "load" }),
  Object.freeze({ match: "generate_image ", fraction: 0.1, stage: "encode" }),
  Object.freeze({ match: "encode_first_stage completed", fraction: 0.18, stage: "condition" }),
  Object.freeze({ match: "get_learned_condition completed", fraction: 0.28, stage: "sample" }),
  Object.freeze({ match: "sampling completed", fraction: 0.94, stage: "decode" }),
  Object.freeze({ match: "decode_first_stage completed", fraction: 0.99, stage: "save" }),
]);
export const SAMPLING_SPAN = Object.freeze([0.28, 0.93]); // "sampling completed" (0.94) then moves on

/**
 * sd-cli's argument list (no exe) for a masked FLUX.2 klein edit.
 * `models` {diffusion, llm, vae}; `init`/`ref`/`mask`/`output` file paths; `width`/`height`
 * the working size (multiples of 16).
 */
export function buildArgs({ models, init, ref = init, mask, prompt, output, width, height, recipe = DEFAULT_SD_RECIPE }) {
  const r = { ...DEFAULT_SD_RECIPE, ...recipe };
  for (const [k, v] of Object.entries({ diffusion: models?.diffusion, llm: models?.llm, vae: models?.vae, init, mask, output })) {
    if (!v) throw new TypeError(`buildArgs: ${k} is required`);
  }
  if (!(width % 16 === 0 && height % 16 === 0)) throw new RangeError(`buildArgs: ${width}x${height} is not a multiple of 16`);
  const args = [
    "--diffusion-model",
    models.diffusion,
    "--llm",
    models.llm,
    "--vae",
    models.vae,
    "-i",
    init,
    "-r",
    ref,
    "--mask",
    mask,
    "-p",
    prompt,
    "-W",
    String(width),
    "-H",
    String(height),
    "--steps",
    String(r.steps),
    "--cfg-scale",
    String(r.cfgScale),
    "--strength",
    String(r.strength),
    "--sampling-method",
    r.samplingMethod,
    "-s",
    String(r.seed),
  ];
  if (r.offloadToCpu) args.push("--offload-to-cpu");
  if (r.verbose) args.push("-v");
  args.push(...(r.extraArgs || []));
  args.push("-o", output);
  return args;
}

const ESC = String.fromCharCode(27);
// ANSI escape sequences (sd-cli's `--color` tags, the bars' ESC[K).
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, "g");
// "|=====>     | 2/4 - 2.61s/it" (the sampler) — the tensor-loading bars end in MB/s or GB/s.
const STEP_BAR = /\|\s*(\d+)\/(\d+)\s*-\s*[\d.]+\s*(?:s\/it|it\/s)/;
// Line ends: CR, LF, and the ESC[K ("erase to end of line") each progress-bar redraw ends with.
const LINE_END = new RegExp(`\\r\\n|\\r|\\n|${ESC}\\[K`);

/**
 * Turns sd-cli's output into a monotonic 0..1 progress. `push(chunk, stream)` per output
 * chunk; `onProgress({fraction, stage, step, steps})` fires whenever the fraction moves.
 */
export class SdProgress {
  constructor(onProgress = null, { marks = PROGRESS_MARKS, span = SAMPLING_SPAN } = {}) {
    this.onProgress = onProgress;
    this.marks = marks;
    this.span = span;
    this.fraction = 0;
    this.stage = "start";
    this.step = 0;
    this.steps = 0;
    this.partial = { stdout: "", stderr: "" };
  }

  push(chunk, stream = "stdout") {
    const text = (this.partial[stream] || "") + String(chunk);
    const lines = text.split(LINE_END);
    this.partial[stream] = lines.pop();
    for (const line of lines) this.line(line);
    // A bar is often left unterminated until the next redraw: read the tail too.
    if (STEP_BAR.test(this.partial[stream].replace(ANSI, ""))) this.line(this.partial[stream]);
  }

  /** Flush what is left of both streams (at exit). */
  end() {
    for (const s of Object.keys(this.partial)) {
      if (this.partial[s]) this.line(this.partial[s]);
      this.partial[s] = "";
    }
  }

  line(raw) {
    const line = raw.replace(ANSI, "");
    const bar = STEP_BAR.exec(line);
    if (bar) {
      const step = Number(bar[1]);
      const steps = Number(bar[2]);
      if (steps > 0) {
        this.step = step;
        this.steps = steps;
        this.move(this.span[0] + (this.span[1] - this.span[0]) * Math.min(1, step / steps), "sample");
      }
      return;
    }
    for (const m of this.marks) if (line.includes(m.match)) this.move(m.fraction, m.stage);
  }

  move(fraction, stage) {
    if (fraction <= this.fraction) return;
    this.fraction = fraction;
    this.stage = stage;
    this.onProgress?.({ fraction, stage, step: this.step, steps: this.steps });
  }
}

/** sd-cli exited non-zero (or by a signal); `tail` is its last output. */
export class SdCliError extends Error {
  constructor(message, { code = null, signal = null, tail = "" } = {}) {
    super(message);
    this.name = "SdCliError";
    this.code = code;
    this.signal = signal;
    this.tail = tail;
  }
}

const TAIL_CHARS = 4000;

/**
 * Run `bin args`: resolves when sd-cli exits 0; rejects with SdCliError on a failure and
 * with `signal.reason` (an AbortError) when `signal` aborts — the process is killed.
 * `onProgress` gets SdProgress events; `onOutput(stream, text)` every raw chunk; `logPath`
 * appends both streams to a file (the kit's seam does it). `spawn`/`close` are test seams
 * (default: the kit's spawnChild / closeJob).
 */
export async function runSdCli(
  bin,
  args,
  { onProgress = null, onOutput = null, signal = null, logPath = null, cwd = dirname(bin), spawn = spawnChild, close = closeJob } = {},
) {
  signal?.throwIfAborted();
  const popen = (argv, opts) => procs.popen(argv, { ...opts, cwd });
  const [proc, job] = await spawn(popen, [bin, ...args], logPath);
  const progress = new SdProgress(onProgress);
  let tail = "";
  const exited = new Promise((resolve) => {
    proc.once("close", (code, sig) => resolve({ code, sig }));
  });
  for (const stream of ["stdout", "stderr"]) {
    const decoder = new StringDecoder("utf8");
    proc[stream]?.on("data", (d) => {
      const text = typeof d === "string" ? d : decoder.write(d);
      tail = (tail + text).slice(-TAIL_CHARS);
      onOutput?.(stream, text);
      progress.push(text, stream);
    });
  }
  const kill = () => {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    close(job); // KILL_ON_JOB_CLOSE takes anything sd-cli started with it
  };
  signal?.addEventListener("abort", kill, { once: true });
  if (signal?.aborted) kill();
  try {
    const { code, sig } = await exited;
    progress.end();
    signal?.throwIfAborted();
    if (code !== 0) {
      throw new SdCliError(`sd-cli failed (${sig ? `signal ${sig}` : `exit ${code}`}): ${lastLines(tail, 6)}`, { code, signal: sig, tail });
    }
  } finally {
    signal?.removeEventListener("abort", kill);
    close(job);
  }
}

function lastLines(text, n) {
  return text
    .replace(ANSI, "")
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-n)
    .join(" | ");
}
