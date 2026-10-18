// SPDX-License-Identifier: MIT
// A server job (finding parts, a download, an AI photo) seen from the screen: the start request,
// then `GET /v1/jobs/:id` until it ends — inside the kit's `withAiTask`, so the family's task strip
// shows it with its progress and its Cancel stops it on the server too (app-structure §8, the
// AI-call convention: app code never owns a task's lifecycle).
import { del, get, withAiTask } from "@delebash/ui";
import { i18n } from "../i18n/index.js";

export const POLL_MS = 400;

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener?.(
      "abort",
      () => {
        clearTimeout(t);
        reject(Object.assign(new Error("cancelled"), { name: "AbortError" }));
      },
      { once: true },
    );
  });

/** The Error a failed job becomes — shaped like the kit transport's (§15), so reportError reads it. */
export function jobError(job) {
  const message = job.error?.message || i18n.global.t("jobs.failed");
  const status = job.error?.status || 500;
  return Object.assign(new Error(message), { status, problem: { title: "", detail: message }, errors: [], requestId: null });
}

/**
 * Run a server job as one task. `start()` posts the request and answers the job's snapshot;
 * `feature` and `label` name the task on the strip. Resolves with the job's result; a cancel
 * rejects with an AbortError (the strip shows it as cancelled, never as a failure).
 */
export function runServerJob({ start, feature, label, pollMs = POLL_MS }) {
  return withAiTask({ feature, label }, async (task) => {
    let job = await start();
    task.signal.addEventListener("abort", () => del(`/v1/jobs/${encodeURIComponent(job.id)}`).catch(() => {}), { once: true });
    while (job.state === "running") {
      task.setProgress(Math.round((job.progress || 0) * 100), 100);
      await wait(pollMs, task.signal);
      job = await get(`/v1/jobs/${encodeURIComponent(job.id)}`);
    }
    if (job.state === "cancelled") throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    if (job.state === "error") throw jobError(job);
    // wrapped: the kit unwraps a bare `{ result }`, and a job's own result may have that key
    return { result: job.result };
  });
}
