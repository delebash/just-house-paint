// SPDX-License-Identifier: MIT
// Long server work — finding a photo's parts, a model download, an AI photo — runs as a job the
// screen polls (`GET /v1/jobs/:id`) inside the kit's `withAiTask`, so the family's task strip shows
// its progress and its Cancel stops it (app-structure §8, the AI-call convention). One job per
// kind and key (a house) at a time: starting one that is already running answers the running
// one. A finished job is kept a while for the poller to read, then forgotten.
//
// App-local until a second app needs it (the kit's TASKS: server-side jobs are a standards gap).

import { randomUUID } from "node:crypto";
import { ApiError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";

const log = getLogger("just_house_paint.jobs");

const isAbort = (e) => e?.name === "AbortError" || e?.code === "ABORT_ERR";

export class JobRegistry {
  /** `onFinish(job)`: a job ended (done, failed or cancelled) — the window that started it changed something
   *  (the kit's ChangeCounter counts it as that window's). */
  constructor({ keepMs = 10 * 60_000, onFinish = null } = {}) {
    this.keepMs = keepMs;
    this.jobs = new Map();
    // a forgotten job's end, kept for this process's life (the last 1000): a window that slept through it is told it
    // ended — not that the server started again (410 Gone; the thirteenth review)
    this.ended = new Map();
    this.onFinish = onFinish;
    // work on the graphics card that isn't a job (AI color schemes on the local model): kind → { label, n }
    this.holds = new Map();
  }

  /** Work of `kind` holds the graphics card until the returned release() — the AI photo, which stops the local
   *  AI model to free the card, waits for it (assertGpuFree). */
  hold(kind, label = "") {
    const h = this.holds.get(kind) ?? { label, n: 0 };
    h.n += 1;
    this.holds.set(kind, h);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      h.n -= 1;
      if (!h.n) this.holds.delete(kind);
    };
  }

  /** The running job of this kind and key, if any. */
  running(kind, key) {
    for (const j of this.jobs.values()) if (j.kind === kind && j.key === key && j.state === "running") return j;
    return null;
  }

  /** The running jobs for `key` (a house), as the wire shows them — a page opened or reloaded while they run
   *  attaches to them. */
  runningFor(key) {
    return [...this.jobs.values()].filter((j) => j.key === key && j.state === "running").map(snapshot);
  }

  /** A running job of any of these kinds (for any house), or null. */
  busy(kinds) {
    for (const j of this.jobs.values()) if (kinds.includes(j.kind) && j.state === "running") return j;
    return null;
  }

  /**
   * Start `fn({ signal, progress })` as a job (or answer the one already running for this kind
   * and key). `progress(fraction 0–1, message?)` reports along the way; the returned value is the
   * job's result. `clientId`: the window that started it; `meta`: its choices (a second start reads
   * them). Returns the job's snapshot.
   */
  start({ kind, key = "", label = "", failTitle = "", clientId = null, meta = null }, fn) {
    this.sweep();
    const existing = this.running(kind, key);
    if (existing) return snapshot(existing);
    const controller = new AbortController();
    const job = {
      id: randomUUID(),
      kind,
      key,
      label,
      state: "running",
      progress: 0,
      message: "",
      result: null,
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      controller,
      clientId,
      meta,
    };
    this.jobs.set(job.id, job);
    const progress = (fraction, message) => {
      if (job.state !== "running") return;
      job.progress = Math.max(job.progress, Math.min(1, Number(fraction) || 0));
      if (message !== undefined) job.message = String(message);
    };
    const finish = (state, fields) => {
      Object.assign(job, { state, finishedAt: new Date().toISOString() }, fields);
      try {
        this.onFinish?.(job);
      } catch {
        // a watcher's error never fails the job
      }
    };
    job.settled = Promise.resolve()
      .then(() => fn({ signal: controller.signal, progress }))
      .then(
        // the work returned: it is done (and saved), even when Cancel came while it was committing
        (result) => finish("done", { result: result ?? null, progress: 1 }),
        (err) => {
          if (controller.signal.aborted || isAbort(err)) return finish("cancelled", {});
          log.error(`${kind} ${key}: ${err?.message || err}`, err);
          // the refusal's own title (an ApiError's), else what the job was doing — the screen's heading
          const title = (typeof err?.title === "string" && err.title) || failTitle || null;
          finish("error", { error: { message: String(err?.message || err), status: err?.statusCode ?? null, title } });
        },
      );
    return snapshot(job);
  }

  get(id) {
    const j = this.jobs.get(id);
    return j ? snapshot(j) : null;
  }

  /** Ask a running job to stop; true when there was one. */
  cancel(id) {
    const j = this.jobs.get(id);
    if (!j || j.state !== "running") return false;
    j.controller.abort();
    return true;
  }

  /** Forget finished jobs older than `keepMs` — each one's end kept (ended). */
  sweep(now = Date.now()) {
    for (const [id, j] of this.jobs) {
      if (j.state !== "running" && j.finishedAt && now - Date.parse(j.finishedAt) > this.keepMs) {
        this.jobs.delete(id);
        this.ended.set(id, { id, kind: j.kind, key: j.key, state: j.state, finishedAt: j.finishedAt });
        if (this.ended.size > 1000) this.ended.delete(this.ended.keys().next().value);
      }
    }
  }

  /** Stop everything (the server is closing, the data is about to be replaced). Resolves once every one of them
   *  has ended — at most `waitMs`: a job past its last check of the signal (a find's commit) finishes what it
   *  does before anything is replaced under it (the twelfth review, 2026-10-20). */
  cancelAll({ waitMs = 30_000 } = {}) {
    const running = [...this.jobs.values()].filter((j) => j.state === "running");
    for (const j of running) j.controller.abort();
    let timer;
    const ended = Promise.all(running.map((j) => j.settled?.catch(() => {})));
    return Promise.race([ended, new Promise((r) => (timer = setTimeout(r, waitMs)))]).finally(() => clearTimeout(timer));
  }
}

/** The jobs that hold the graphics card: the part finder (SAM 3) and the AI photo (sd-cli). */
const GPU_KINDS = ["find-parts", "aiphoto"];

/**
 * The graphics card does one of these at a time — an 8 GB card holds SAM 3 or the AI photo's model,
 * not both (RESEARCH §11), and the AI photo frees the finder when it starts. Throws a 409 when work
 * for `kind` on `key` would run beside a running one: `"aiphoto"` (any running GPU job, another AI
 * photo of the same house too — its colors would be ignored), `"find-parts"` (the AI photo, or the
 * parts of another house; the same house's run is answered by start()), `"box"` and `"local-ai"`
 * (any running GPU job). The AI photo also waits for AI color schemes on the local model (a hold — it would
 * stop the model under them: the eleventh review, 2026-10-20).
 */
export function assertGpuFree(jobs, kind, key = "") {
  if (kind === "aiphoto" && jobs.holds?.has("local-ai")) {
    throw new ApiError(409, "gpu-busy", "The graphics card is busy", "AI color schemes are being made on this computer's AI model — try again when they're done");
  }
  for (const j of jobs.jobs.values()) {
    if (j.state !== "running" || !GPU_KINDS.includes(j.kind)) continue;
    if (kind === "find-parts" && j.kind === "find-parts" && j.key === key) continue;
    const doing = j.kind === "aiphoto" ? `an AI photo of ${j.label || "a house"} is being drawn` : `the parts of ${j.label || "a house"} are being found`;
    throw new ApiError(409, "gpu-busy", "The graphics card is busy", `${doing} — try again when it's done`);
  }
}

/** The wire shape (camelCase, no internals). */
function snapshot(j) {
  return {
    id: j.id,
    kind: j.kind,
    key: j.key,
    label: j.label,
    state: j.state,
    progress: j.progress,
    message: j.message,
    result: j.result,
    error: j.error,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
  };
}
