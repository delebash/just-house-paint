// SPDX-License-Identifier: MIT
// The job registry's states, and the graphics card's one-at-a-time gate (jobs.js).
import { expect, test } from "vitest";
import { assertGpuFree, JobRegistry } from "../src/jobs.js";

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

test("the graphics card does one thing at a time: the AI photo, a part search, a box, the local AI", async () => {
  const jobs = new JobRegistry();
  let done;
  const held = new Promise((r) => (done = r));
  jobs.start({ kind: "aiphoto", key: "h1", label: "Main street" }, () => held);
  const refused = (kind, key) => {
    try {
      assertGpuFree(jobs, kind, key);
      return null;
    } catch (e) {
      return e;
    }
  };
  expect(refused("aiphoto", "h1")).toMatchObject({ statusCode: 409, slug: "gpu-busy" }); // the same house again too
  expect(refused("find-parts", "h2")?.detail).toMatch(/an AI photo of Main street is being drawn/);
  expect(refused("box")).not.toBeNull();
  expect(refused("local-ai")).not.toBeNull();
  done();
  await new Promise((r) => setTimeout(r, 5));
  // a part search: the same house's run is answered by start(); another house waits
  jobs.start({ kind: "find-parts", key: "h1", label: "Main street" }, () => new Promise(() => {}));
  expect(refused("find-parts", "h1")).toBeNull();
  expect(refused("find-parts", "h2")?.detail).toMatch(/the parts of Main street are being found/);
  expect(refused("aiphoto", "h3")).not.toBeNull();
  jobs.cancelAll();
});
