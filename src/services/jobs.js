// SPDX-License-Identifier: MIT
// A server job (finding parts, a download, an AI photo) seen from the screen: the start request,
// then `GET /v1/jobs/:id` until it ends — inside the kit's `withAiTask` (app-structure §8, the
// AI-call convention: app code never owns a task's lifecycle). Its progress shows where the user
// started it — that screen's AiTaskStrip, found with useSurfaceTask(feature, meta) — and in the
// kit's global stack whenever no screen shows it; either's Cancel stops it on the server too.
import { del, get, withAiTask } from "@delebash/ui";
import { i18n } from "../i18n/index.js";

export const POLL_MS = 400;

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(t);
      reject(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    };
    // the listener goes with the wait: a long job polls thousands of times on one signal
    const t = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });

/** The job isn't on the server any more — it started again (the tray's Restart, a reboot) and what it was doing
 *  stopped. The caller reads what it has now (a find's commit may have landed before). */
export function jobGone() {
  const message = i18n.global.t("jobs.gone");
  return Object.assign(new Error(message), { name: "JobGone", status: 404, problem: { title: message, detail: "" }, errors: [], requestId: null });
}

/** The job ended a while ago and the server forgot it (410 — a window asleep through it): `state` says how; the
 *  caller reads what it left (a find's parts, the AI photo kept). */
export function jobEnded(state) {
  return Object.assign(new Error(`ended: ${state}`), { name: "JobEnded", state });
}

/** One look at the job — a network failure (a laptop waking, Wi-Fi coming back) is tried again with a growing wait
 *  (0.4 s → 10 s) for as long as it takes, a busy server (5xx) ten times; neither is the end of the job (the twelfth
 *  review). A job that ended while away is jobEnded; one the server never had (it started again) is jobGone. */
async function poll(id, signal) {
  let busy = 0;
  for (let delay = POLL_MS; ; delay = Math.min(delay * 2, 10_000)) {
    try {
      return await get(`/v1/jobs/${encodeURIComponent(id)}`);
    } catch (e) {
      if (e?.status === 410) throw jobEnded(e.problem?.state || "done");
      if (e?.status === 404) throw jobGone();
      if (e?.status && (e.status < 500 || ++busy > 10)) throw e;
      await wait(delay, signal);
    }
  }
}

/** The Error a failed job becomes — shaped like the kit transport's (§15), so reportError reads it:
 *  the server's title for what failed ("The AI photo didn't finish"), its words as the detail. */
export function jobError(job) {
  const message = job.error?.message || i18n.global.t("jobs.failed");
  const status = job.error?.status || 500;
  return Object.assign(new Error(message), { status, problem: { title: job.error?.title || "", detail: message }, errors: [], requestId: null });
}

/**
 * Run a server job as one task. `start()` posts the request and answers the job's snapshot;
 * `feature` and `label` name the task on the strip, `meta` tells its screen which run is its own
 * (a house's id, a brand); `describe(job, percent)` words the progress from the job's own message
 * (the part being found — "Trim · 40%"), else the percent alone. Resolves with the job's result; a cancel rejects with an AbortError (the
 * strip shows it as cancelled, never as a failure).
 */
export function runServerJob({ start, feature, label, meta, describe, pollMs = POLL_MS }) {
  return withAiTask({ feature, label, meta }, async (task) => {
    let job = await start();
    task.signal.addEventListener("abort", () => del(`/v1/jobs/${encodeURIComponent(job.id)}`).catch(() => {}), { once: true });
    while (job.state === "running") {
      const pct = Math.round((job.progress || 0) * 100);
      task.setProgress(pct, 100, describe?.(job, pct) || i18n.global.t("jobs.percent", { n: pct }));
      await wait(pollMs, task.signal);
      job = await poll(job.id, task.signal);
    }
    if (job.state === "cancelled") throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    if (job.state === "error") throw jobError(job);
    // wrapped: the kit unwraps a bare `{ result }`, and a job's own result may have that key
    return { result: job.result };
  });
}
