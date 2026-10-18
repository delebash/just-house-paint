// SPDX-License-Identifier: MIT
// Long server work — finding a photo's parts, a model download, an AI photo — runs as a job the
// screen polls (`GET /v1/jobs/:id`) inside the kit's `withAiTask`, so the family's task strip shows
// its progress and its Cancel stops it (app-structure §8, the AI-call convention). One job per
// kind and key (a house) at a time: starting one that is already running answers the running
// one. A finished job is kept a while for the poller to read, then forgotten.
//
// App-local until a second app needs it (the kit's TASKS: server-side jobs are a standards gap).

import { randomUUID } from "node:crypto";
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
  start({ kind, key = "", label = "" }, fn) {
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
        (result) => finish(controller.signal.aborted ? "cancelled" : "done", { result: result ?? null, progress: 1 }),
        (err) => {
          if (controller.signal.aborted || isAbort(err)) return finish("cancelled", {});
          log.error(`${kind} ${key}: ${err?.message || err}`, err);
          finish("error", { error: { message: String(err?.message || err), status: err?.statusCode ?? null } });
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
