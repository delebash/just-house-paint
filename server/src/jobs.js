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
  constructor({ keepMs = 10 * 60_000 } = {}) {
    this.keepMs = keepMs;
    this.jobs = new Map();
  }

  /** The running job of this kind and key, if any. */
  running(kind, key) {
    for (const j of this.jobs.values()) if (j.kind === kind && j.key === key && j.state === "running") return j;
    return null;
  }

  /** A running job of any of these kinds (for any house), or null. */
  busy(kinds) {
    for (const j of this.jobs.values()) if (kinds.includes(j.kind) && j.state === "running") return j;
    return null;
  }

  /**
   * Start `fn({ signal, progress })` as a job (or answer the one already running for this kind
   * and key). `progress(fraction 0–1, message?)` reports along the way; the returned value is the
   * job's result. Returns the job's snapshot.
   */
  start({ kind, key = "", label = "", failTitle = "" }, fn) {
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
    };
    this.jobs.set(job.id, job);
    const progress = (fraction, message) => {
      if (job.state !== "running") return;
      job.progress = Math.max(job.progress, Math.min(1, Number(fraction) || 0));
      if (message !== undefined) job.message = String(message);
    };
    const finish = (state, fields) => {
      Object.assign(job, { state, finishedAt: new Date().toISOString() }, fields);
    };
    Promise.resolve()
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

  /** Forget finished jobs older than `keepMs`. */
  sweep(now = Date.now()) {
    for (const [id, j] of this.jobs) {
      if (j.state !== "running" && j.finishedAt && now - Date.parse(j.finishedAt) > this.keepMs) this.jobs.delete(id);
    }
  }

  /** Stop everything (the server is closing). */
  cancelAll() {
    for (const j of this.jobs.values()) if (j.state === "running") j.controller.abort();
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
 * (any running GPU job).
 */
export function assertGpuFree(jobs, kind, key = "") {
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
