// SPDX-License-Identifier: MIT
// The brands' lists go through the kit's one HTTP client, as the model downloads do: behind a proxy
// (HTTPS_PROXY) they reach it, and a load that fails says why (2026-10-20, the thirteenth review — the
// brand lists used Node's own fetch, which ignores the proxy, while the downloads went through it). The
// kit builds its agent when it loads, so the proxy is set first and the app imported after (each test
// file runs in its own process).
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

let proxy;
const seen = [];

beforeAll(async () => {
  // a proxy that refuses everything, so nothing goes past it
  proxy = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.writeHead(403).end();
  });
  proxy.on("connect", (req, socket) => {
    seen.push(`CONNECT ${req.url}`);
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
  });
  await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
});

afterAll(() => new Promise((r) => proxy.close(r)));

test("a brand's list goes through the proxy the downloads use, and its failure keeps the proxy's answer", async () => {
  const url = `http://127.0.0.1:${proxy.address().port}`;
  for (const name of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]) vi.stubEnv(name, url);
  vi.stubEnv("NO_PROXY", "");
  vi.stubEnv("no_proxy", "");
  const { migrate, openDatabase } = await import("@delebash/core/platform");
  const { MIGRATIONS } = await import("../src/database/schema.js");
  const { loadFeed } = await import("../src/paints/feeds.js");
  const { createServices } = await import("../src/services.js");
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "hp-proxy-"));
  const db = openDatabase(path.join(dataDir, "app.db"), { foreignKeys: true });
  try {
    migrate(db, MIGRATIONS);
    const services = createServices({ db, dataDir });
    // a name that resolves nowhere: only a proxy can take it
    const feeds = [{ brand: "x", label: "X", url: "https://paint-brand.invalid/colors.json", parser: "prism", select: null }];
    const err = await loadFeed("x", { fetch: services.fetch, feeds }).catch((e) => e);
    expect(seen).toContain("CONNECT paint-brand.invalid:443");
    expect(err.message).toMatch(/^couldn't reach paint-brand\.invalid: fetch failed \(.+\)$/);
  } finally {
    db.raw.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
