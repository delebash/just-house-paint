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
  /** `onFinish(job)`: a job ended (done, failed or cancelled) — the window that started it changed something
   *  (the kit's ChangeCounter counts it as that window's). */
  constructor({ keepMs = 10 * 60_000, onFinish = null } = {}) {
    this.keepMs = keepMs;
    this.jobs = new Map();
    // a forgotten job's end, kept for this process's life (the last 1000): a window that slept through it is told it
    // ended — not that the server started again (410 Gone; the thirteenth review)
    this.ended = new Map();
    this.onFinish = onFinish;
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
