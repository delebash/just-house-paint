// SPDX-License-Identifier: MIT
// The job registry's states (jobs.js); the graphics card's turns are the kit's arbiter's.
import { expect, test } from "vitest";
import { ApiError } from "@delebash/core/platform/errors";
import { JobRegistry } from "../src/jobs.js";

const settle = async (jobs, id) => {
  for (let i = 0; i < 100 && jobs.get(id).state === "running"; i++) await new Promise((r) => setTimeout(r, 5));
  return jobs.get(id);
};
const tick = () => new Promise((r) => setTimeout(r, 0));
/** Work that stops when its signal aborts (also when it was aborted before the work began). */
const stopsOnSignal = ({ signal }) =>
  new Promise((_, no) => {
    const stop = () => no(Object.assign(new Error("x"), { name: "AbortError" }));
    if (signal.aborted) stop();
    else signal.addEventListener("abort", stop);
  });

test("a failed job names what failed: the refusal's own title, else the job's", async () => {
  const jobs = new JobRegistry();
  const raw = jobs.start({ kind: "aiphoto", key: "h1", failTitle: "The AI photo didn't finish" }, async () => {
    throw new Error("sd-cli failed (exit 3)");
  });
  expect((await settle(jobs, raw.id)).error).toEqual({ message: "sd-cli failed (exit 3)", status: null, title: "The AI photo didn't finish" });
  const refused = jobs.start({ kind: "aiphoto", key: "h2", failTitle: "The AI photo didn't finish" }, async () => {
    throw new ApiError(409, "models-missing", "The AI photo isn't installed", "install it first");
  });
  expect((await settle(jobs, refused.id)).error).toMatchObject({ status: 409, title: "The AI photo isn't installed" });
});

test("work that returned is done — a Cancel that came while it was saving doesn't call it cancelled", async () => {
  const jobs = new JobRegistry();
  let release;
  const job = jobs.start({ kind: "find-parts", key: "h1" }, () => new Promise((r) => (release = r)));
  await tick(); // the work starts on the next turn
  jobs.cancel(job.id);
  release({ parts: 3 });
  expect(await settle(jobs, job.id)).toMatchObject({ state: "done", result: { parts: 3 } });
  // work that stops on the signal is cancelled
  const stops = jobs.start({ kind: "find-parts", key: "h2" }, stopsOnSignal);
  jobs.cancel(stops.id);
  expect((await settle(jobs, stops.id)).state).toBe("cancelled");
});
