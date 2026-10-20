// SPDX-License-Identifier: MIT
// Another window's changes (services/otherWindows.js): the server's counter moving bumps `changes`; a page busy
// with a stroke holds it until it is done; a new series (a restore or a reset) reloads the window instead.
import { afterEach, expect, test, vi } from "vitest";
import { holdChangesWhile, otherWindows, watchOtherWindows } from "./otherWindows.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("the counter moving bumps the pages; a busy page holds it; a new series reloads the window", async () => {
  vi.useFakeTimers();
  const answer = { rev: 1, epoch: "e1", pollSeconds: 1 };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(answer), { headers: { "content-type": "application/json" } })));
  const reload = vi.fn();
  const stop = watchOtherWindows({ reload });
  await vi.advanceTimersByTimeAsync(10);
  const start = otherWindows.changes;

  answer.rev = 2;
  await vi.advanceTimersByTimeAsync(1000);
  expect(otherWindows.changes).toBe(start + 1);

  // a stroke being saved: the change waits for it
  let busy = true;
  const release = holdChangesWhile(() => busy);
  answer.rev = 3;
  await vi.advanceTimersByTimeAsync(2000);
  expect(otherWindows.changes).toBe(start + 1);
  busy = false;
  await vi.advanceTimersByTimeAsync(1000);
  expect(otherWindows.changes).toBe(start + 2);
  release();

  // a restore on the server: everything replaced — the window reloads
  answer.rev = 4;
  answer.epoch = "e2";
  await vi.advanceTimersByTimeAsync(1000);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(otherWindows.changes).toBe(start + 2);
  // the reload is marked (a page's "leave without saving?" lets it go), the words kept for after it, and the new
  // series taken first: kept on the page, it would not reload again for it (the nineteenth review)
  expect(otherWindows.replaced).toBe(true);
  expect(sessionStorage.getItem("justhousepaint.replacedElsewhere")).toBe("1");
  await vi.advanceTimersByTimeAsync(2000);
  expect(reload).toHaveBeenCalledTimes(1);
  stop();
  // the next start says it once
  sessionStorage.setItem("justhousepaint.replacedElsewhere", "1");
  const again = watchOtherWindows({ reload });
  expect(sessionStorage.getItem("justhousepaint.replacedElsewhere")).toBeNull();
  again();
  otherWindows.replaced = false;
});
