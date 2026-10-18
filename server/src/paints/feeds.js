// SPDX-License-Identifier: MIT
// Option B (an opt-in setting): the brands' public color lists, loaded by the server on first use
// and cached by the app (RESEARCH §10; TASKS "Design decisions after probe round 1"). The repo
// ships no brand data — these are addresses and field maps only. `fetch` is always injected, so
// nothing here reaches the network unless the app passes it in.
//
// Shapes measured live, once each, 2026-10-17 (RESEARCH §10 holds the counts):
// - api.sherwin-williams.com/prism/v1/colors/<brand>: a JSON array; colorNumber, name, hex,
//   red/green/blue, lab{L,A,B}, lrv (sherwin, lowes, dutchboy only), isExterior/isInterior
//   (sherwin only), colorFamilyNames[], brandedCollectionNames[], coordinatingColors{coord1ColorId,
//   coord2ColorId, coord3ColorId|whiteColorId} (feed ids), archived, ignore (sherwin: 56 duplicate
//   rows with id "bright-NNNN"), brandKey ("SW", "HGSW", "" for Valspar and Dutch Boy).
// - `/lowes` = `/valspar` (all 1,596, same hex) + 900 of `/hgtv`'s 930, and it alone carries LRV
//   for both, so Valspar and HGTV Home load from `/lowes`, split by brandKey. The 30 HGTV rows
//   missing from `/lowes` have no coordinating colors.
// - behr.com/colors/color-detail/query-index.json: an AEM Edge "sheet" {total, offset, limit,
//   data[]}; color-code, color-name, rgbhex (no "#"), color-r/g/b, lrv (strings), color-family,
//   archived ("true"/"false"); no exterior flags, no coordinating colors.
import { dedupeByCode, normalizeRow, pickFamily } from "./normalize.js";

const PRISM = "https://api.sherwin-williams.com/prism/v1/colors";

/** The public lists, as data: which brand, where, and which parser reads it. */
export const BRAND_FEEDS = Object.freeze([
  {
    brand: "sherwin-williams",
    label: "Sherwin-Williams",
    url: `${PRISM}/sherwin?lng=en-US`,
    parser: "prism",
    select: null,
  },
  {
    brand: "valspar",
    label: "Valspar",
    url: `${PRISM}/lowes?lng=en-US`,
    parser: "prism",
    select: { brandKey: "" },
  },
  {
    brand: "hgtv-home",
    label: "HGTV Home by Sherwin-Williams",
    url: `${PRISM}/lowes?lng=en-US`,
    parser: "prism",
    select: { brandKey: "HGSW" },
  },
  {
    brand: "dutch-boy",
    label: "Dutch Boy",
    url: `${PRISM}/dutchboy?lng=en-US`,
    parser: "prism",
    select: null,
  },
  {
    brand: "behr",
    label: "Behr",
    url: "https://www.behr.com/colors/color-detail/query-index.json",
    parser: "aem-sheet-behr",
    select: null,
  },
]);

export class FeedError extends Error {
  constructor(message, { status = null, url = null } = {}) {
    super(message);
    this.name = "FeedError";
    this.status = status;
    this.url = url;
  }
}

const matches = (row, select) => !select || Object.entries(select).every(([k, v]) => row[k] === v);

/** Sherwin-Williams' "prism" color service (SW, Valspar, HGTV Home, Dutch Boy). */
function parsePrism(json, feed) {
  if (!Array.isArray(json)) throw new FeedError(`${feed.brand}: expected a JSON array`, { url: feed.url });
  // Coordinating colors point at feed ids (sherwin, lowes, dutchboy) or at color numbers
  // (the standalone /valspar list); both resolve to the target's color number.
  const byId = new Map(json.map((r) => [String(r.id), r]));
  const byNumber = new Map(json.map((r) => [String(r.colorNumber), r]));
  const rows = [];
  for (const r of json) {
    if (!matches(r, feed.select) || r.ignore === true) continue;
    const coordinating = Object.values(r.coordinatingColors ?? {})
      .map((ref) => byId.get(String(ref)) ?? byNumber.get(String(ref)))
      .filter((t) => t && t.brandKey === r.brandKey && t.colorNumber !== r.colorNumber)
      .map((t) => String(t.colorNumber));
    rows.push(
      normalizeRow(
        {
          code: r.colorNumber,
          name: r.name,
          hex: r.hex,
          rgb: [r.red, r.green, r.blue],
          lrv: r.lrv,
          exterior: r.isExterior,
          interior: r.isInterior,
          family: pickFamily(r.colorFamilyNames),
          collection: r.brandedCollectionNames?.[0] ?? null,
          coordinating,
          archived: r.archived,
        },
        { brand: feed.brand, source: "feed", sourceRef: `${feed.url}#${r.id}` },
      ),
    );
  }
  return dedupeByCode(rows);
}

/** Behr's color-detail index (an AEM Edge Delivery "sheet"). */
function parseBehrSheet(json, feed) {
  if (!json || !Array.isArray(json.data)) throw new FeedError(`${feed.brand}: expected { data: [] }`, { url: feed.url });
  const bool = (v) => (v === "true" ? true : v === "false" ? false : null);
  const rows = json.data
    .filter((r) => matches(r, feed.select))
    .map((r) =>
      normalizeRow(
        {
          code: r["color-code"],
          name: r["color-name"],
          hex: r.rgbhex,
          rgb: [r["color-r"], r["color-g"], r["color-b"]].map(Number),
          lrv: r.lrv,
          exterior: null,
          interior: null,
          family: pickFamily(r["color-family"]),
          collection: null,
          coordinating: [],
          archived: bool(r.archived),
        },
        { brand: feed.brand, source: "feed", sourceRef: `${feed.url}#${r.path ?? r["color-code"]}` },
      ),
    );
  return dedupeByCode(rows);
}

export const FEED_PARSERS = Object.freeze({ prism: parsePrism, "aem-sheet-behr": parseBehrSheet });

async function getJson(url, { fetch, signal, headers }) {
  const res = await fetch(url, { headers: { accept: "application/json", ...headers }, signal });
  if (!res.ok) throw new FeedError(`HTTP ${res.status} from ${url}`, { status: res.status, url });
  try {
    return await res.json();
  } catch (err) {
    throw new FeedError(`not JSON from ${url}: ${err.message}`, { status: res.status, url });
  }
}

/** An AEM sheet sends {total, offset, limit, data}; fetch the remaining pages, if any. */
async function readAllPages(first, url, opts) {
  if (!first || !Array.isArray(first.data) || typeof first.total !== "number") return first;
  const data = [...first.data];
  while (data.length < first.total) {
    const page = new URL(url);
    page.searchParams.set("offset", String(data.length));
    page.searchParams.set("limit", String(first.limit || first.data.length || 1000));
    const next = await getJson(page.href, opts);
    if (!Array.isArray(next?.data) || next.data.length === 0) break;
    data.push(...next.data);
  }
  return { ...first, data, offset: 0, limit: data.length };
}

/**
 * Loads one brand's public list and returns normalized rows.
 * @param {string} brand  a `BRAND_FEEDS` brand key
 * @param {{ fetch: typeof fetch, cache?: Map<string, Promise<unknown>>, signal?: AbortSignal,
 *   headers?: Record<string,string>, feeds?: typeof BRAND_FEEDS }} options  `cache` shares one
 *   download between brands that come from the same address (Valspar and HGTV Home → /lowes).
 */
export async function loadFeed(brand, { fetch, cache, signal, headers = {}, feeds = BRAND_FEEDS } = {}) {
  if (typeof fetch !== "function") throw new TypeError("loadFeed needs an injected fetch");
  const feed = feeds.find((f) => f.brand === brand);
  if (!feed) throw new FeedError(`no public list for brand "${brand}"`);
  const parse = FEED_PARSERS[feed.parser];
  if (!parse) throw new FeedError(`unknown parser "${feed.parser}"`);
  const opts = { fetch, signal, headers: { ...feed.headers, ...headers } };
  let json = cache?.get(feed.url);
  if (!json) {
    json = getJson(feed.url, opts).then((first) => readAllPages(first, feed.url, opts));
    cache?.set(feed.url, json);
    json.catch(() => cache?.delete(feed.url));
  }
  return parse(await json, feed);
}
