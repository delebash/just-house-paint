// SPDX-License-Identifier: MIT
// The public lists (option B), read from SYNTHETIC fixtures through an injected fetch.
import { describe, expect, test, vi } from "vitest";
import { BRAND_FEEDS, FeedError, loadFeed } from "../../src/paints/feeds.js";
import { behrRows, behrSheet, prismDutchBoy, prismLowes, prismSherwin, prismValspar } from "./fixtures/feeds.js";

/** A fetch that answers by URL substring; records every call. */
function fakeFetch(routes) {
  return vi.fn(async (url) => {
    const hit = Object.entries(routes).find(([k]) => String(url).includes(k));
    if (!hit) return new Response("not found", { status: 404 });
    const body = typeof hit[1] === "function" ? hit[1](String(url)) : hit[1];
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
}

const routes = {
  "/prism/v1/colors/sherwin": prismSherwin,
  "/prism/v1/colors/lowes": prismLowes,
  "/prism/v1/colors/dutchboy": prismDutchBoy,
  "query-index.json": behrSheet(),
};

describe("BRAND_FEEDS", () => {
  test("is data: five brands, each with a url and a known parser", () => {
    expect(BRAND_FEEDS.map((f) => f.brand)).toEqual(["sherwin-williams", "valspar", "hgtv-home", "dutch-boy", "behr"]);
    for (const f of BRAND_FEEDS) {
      expect(f.url).toMatch(/^https:\/\//);
      expect(["prism", "aem-sheet-behr"]).toContain(f.parser);
    }
    expect(JSON.parse(JSON.stringify(BRAND_FEEDS))).toEqual(BRAND_FEEDS);
  });
});

describe("loadFeed — Sherwin-Williams", () => {
  test("rows in the app's shape, exterior flags and LRV carried over, ignore duplicates dropped", async () => {
    const fetch = fakeFetch(routes);
    const rows = await loadFeed("sherwin-williams", { fetch });
    expect(rows.map((r) => r.code)).toEqual(["9901", "9902", "9903", "9904", "9905"]);
    const linen = rows[0];
    expect(linen).toMatchObject({
      brand: "sherwin-williams",
      code: "9901",
      name: "Fixture Linen",
      hex: "#ece8dc",
      rgb: [236, 232, 220],
      lrv: 81.2,
      exterior: true,
      interior: true,
      family: "White & Pastel",
      collection: "Invented Collection",
      archived: false,
      source: "feed",
      sourceRef: `${BRAND_FEEDS[0].url}#91001`,
    });
    expect(linen.lab).toHaveLength(3);
    expect(rows[4]).toMatchObject({ exterior: false, archived: true, family: "Red" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers.accept).toBe("application/json");
  });

  test("coordinating feed ids become color numbers, the matching white included", async () => {
    const rows = await loadFeed("sherwin-williams", { fetch: fakeFetch(routes) });
    expect(rows[0].coordinating).toEqual(["9902", "9903", "9904"]);
    expect(rows[3].coordinating).toEqual([]);
  });
});

describe("loadFeed — the /lowes list (Valspar and HGTV Home)", () => {
  test("Valspar: brandKey '' rows only, LRV present, exterior unknown", async () => {
    const rows = await loadFeed("valspar", { fetch: fakeFetch(routes) });
    expect(rows.map((r) => r.code)).toEqual(["9001-1A", "9001-2B", "9001-3C"]);
    expect(rows[0]).toMatchObject({ brand: "valspar", lrv: 27, exterior: null, interior: null, family: "Green" });
    // coord3 "9999" points at nothing; a coordinating color in another brand would be dropped
    expect(rows[0].coordinating).toEqual(["9001-2B", "9001-3C"]);
    expect(rows[1].coordinating).toEqual(["9001-1A", "9001-3C"]);
  });

  test("HGTV Home: HGSW rows only; empty and cross-brand coordinating ids dropped", async () => {
    const rows = await loadFeed("hgtv-home", { fetch: fakeFetch(routes) });
    expect(rows.map((r) => r.code)).toEqual(["9911", "9912"]);
    expect(rows[0].coordinating).toEqual(["9912"]);
  });

  test("a shared cache downloads /lowes once for both brands", async () => {
    const fetch = fakeFetch(routes);
    const cache = new Map();
    await Promise.all([loadFeed("valspar", { fetch, cache }), loadFeed("hgtv-home", { fetch, cache })]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("the standalone /valspar shape (coordinating by color number) also parses", async () => {
    const feeds = [{ brand: "valspar", url: "https://example.test/prism/v1/colors/valspar", parser: "prism", select: null }];
    const rows = await loadFeed("valspar", { fetch: fakeFetch({ "/colors/valspar": prismValspar }), feeds });
    expect(rows[0].coordinating).toEqual(["9001-2B", "9001-3C"]);
    expect(rows[0].lrv).toBeNull();
  });
});

describe("loadFeed — Dutch Boy", () => {
  test("rows, LRV, title-cased capitals, an LRV of 0 treated as missing", async () => {
    const rows = await loadFeed("dutch-boy", { fetch: fakeFetch(routes) });
    expect(rows.map((r) => r.code)).toEqual(["901-1DB", "901-5DB", "902A"]);
    expect(rows[0]).toMatchObject({ name: "Fixture Pearl", lrv: 83, collection: "One Coat", exterior: null });
    expect(rows[0].coordinating).toEqual(["901-5DB", "902A"]);
    expect(rows[2].lrv).toBeNull();
  });
});

describe("loadFeed — Behr", () => {
  test("string fields become numbers and booleans; hex gains its '#'", async () => {
    const rows = await loadFeed("behr", { fetch: fakeFetch(routes) });
    expect(rows).toHaveLength(behrRows.length);
    expect(rows[0]).toMatchObject({
      brand: "behr",
      code: "ZZ1-01",
      name: "Fixture Sand",
      hex: "#dcc8aa",
      rgb: [220, 200, 170],
      lrv: 60,
      exterior: null,
      interior: null,
      family: "Orange",
      collection: null,
      coordinating: [],
      archived: false,
      sourceRef: expect.stringContaining("#/colors/color-detail/zz1-01"),
    });
    expect(rows[3].archived).toBe(true);
    expect(rows[4].family).toBeNull(); // "Marquee" is not a hue family
  });

  test("reads every page when the sheet is paged", async () => {
    const pages = vi.fn((url) => {
      const u = new URL(url);
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const limit = Number(u.searchParams.get("limit") ?? 2);
      return { total: behrRows.length, offset, limit, data: behrRows.slice(offset, offset + limit), ":type": "sheet" };
    });
    const fetch = fakeFetch({ "query-index.json": pages });
    const rows = await loadFeed("behr", { fetch });
    expect(rows.map((r) => r.code)).toEqual(behrRows.map((r) => r["color-code"]));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[1][0]).toContain("offset=2");
  });
});

describe("loadFeed — errors", () => {
  test("needs an injected fetch", async () => {
    await expect(loadFeed("behr", {})).rejects.toThrow(TypeError);
  });

  test("an unknown brand", async () => {
    await expect(loadFeed("benjamin-moore", { fetch: fakeFetch(routes) })).rejects.toThrow(/no public list/);
  });

  test("an HTTP error carries its status", async () => {
    const fetch = vi.fn(async () => new Response("blocked", { status: 403 }));
    const err = await loadFeed("behr", { fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(FeedError);
    expect(err.status).toBe(403);
  });

  test("a request that got no answer keeps its cause: never 'fetch failed' alone", async () => {
    // undici rejects with "fetch failed" and keeps why in `cause` — the brand's error said only that (2026-10-20)
    const refused = Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:443"), { code: "ECONNREFUSED" });
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause: refused });
    });
    const err = await loadFeed("behr", { fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(FeedError);
    expect(err.message).toBe("couldn't reach www.behr.com: fetch failed (connect ECONNREFUSED 10.0.0.1:443)");
    expect(err.cause.cause).toBe(refused);
    // a code its message doesn't name, and every address of an AggregateError
    const proxy = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("Proxy response (403) !== 200 when HTTP Tunneling"), { code: "UND_ERR_ABORTED" }) });
    });
    expect((await loadFeed("behr", { fetch: proxy }).catch((e) => e)).message).toMatch(/\(UND_ERR_ABORTED: Proxy response \(403\)/);
    const all = Object.assign(new AggregateError([new Error("connect ETIMEDOUT 1.2.3.4:443"), new Error("connect ENETUNREACH ::1:443")]), { code: "ETIMEDOUT" });
    const aggregate = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause: all });
    });
    expect((await loadFeed("behr", { fetch: aggregate }).catch((e) => e)).message).toMatch(/\(connect ETIMEDOUT 1\.2\.3\.4:443; connect ENETUNREACH ::1:443\)$/);
    // a cancel stays the cancel
    const ac = new AbortController();
    ac.abort();
    const cancelled = vi.fn(async () => {
      throw new DOMException("This operation was aborted", "AbortError");
    });
    expect((await loadFeed("behr", { fetch: cancelled, signal: ac.signal }).catch((e) => e)).name).toBe("AbortError");
  });

  test("a body that is not JSON, or not the expected shape", async () => {
    const html = vi.fn(async () => new Response("<html>", { status: 200 }));
    await expect(loadFeed("behr", { fetch: html })).rejects.toThrow(/not JSON/);
    await expect(loadFeed("sherwin-williams", { fetch: fakeFetch({ sherwin: { data: [] } }) })).rejects.toThrow(/expected a JSON array/);
  });

  test("a failed download is not cached", async () => {
    const cache = new Map();
    const bad = vi.fn(async () => new Response("down", { status: 503 }));
    await expect(loadFeed("valspar", { fetch: bad, cache })).rejects.toThrow(FeedError);
    await Promise.resolve();
    expect(cache.size).toBe(0);
    const rows = await loadFeed("valspar", { fetch: fakeFetch(routes), cache });
    expect(rows).toHaveLength(3);
  });
});
