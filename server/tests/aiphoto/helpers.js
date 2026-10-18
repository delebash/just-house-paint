// SPDX-License-Identifier: MIT
// Test seams: a fake of the kit's spawnChild that "runs" sd-cli by replaying output chunks.
import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";

const tick = () => new Promise((r) => setImmediate(r));

/**
 * `spawn(popen, argv, logPath)` → `[proc, job]` like the kit's spawnChild. The fake process
 * runs `onStart(argv)` (e.g. write the render file), replays `chunks` ([{stream, text}]),
 * then exits with `code`. `kill()` ends it at once with SIGKILL. `closed` records the jobs
 * closed by the caller (pass `close` to runSdCli).
 */
export function fakeSpawn({ chunks = [], code = 0, onStart = null, pauseAfter = Number.POSITIVE_INFINITY } = {}) {
  const calls = [];
  const closed = [];
  const spawn = async (_popen, argv, logPath) => {
    const proc = new EventEmitter();
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    proc.pid = 4242;
    proc.killedWith = null;
    let done = false;
    const finish = async (c, sig) => {
      if (done) return;
      done = true;
      const ended = Promise.all([once(proc.stdout, "end"), once(proc.stderr, "end")]);
      proc.stdout.end();
      proc.stderr.end();
      await ended;
      proc.emit("exit", c, sig);
      proc.emit("close", c, sig);
    };
    proc.kill = (sig) => {
      proc.killedWith = sig;
      finish(null, sig);
      return true;
    };
    const job = { id: calls.length };
    calls.push({ argv, logPath, proc, job });
    (async () => {
      await tick();
      await onStart?.(argv);
      for (const [i, ch] of chunks.entries()) {
        if (done) return;
        if (i >= pauseAfter) return; // hangs here until killed
        proc[ch.stream].write(ch.text);
        await tick();
      }
      await finish(code, null);
    })();
    return [proc, job];
  };
  return { spawn, calls, closed, close: (job) => closed.push(job) };
}

/** The value of `flag` in an argv list. */
export const argOf = (argv, flag) => argv[argv.indexOf(flag) + 1];
