// SPDX-License-Identifier: MIT
// The brands that publish their colors as palette FILES rather than a list the app can read —
// Benjamin Moore (one Adobe swatch file per collection) and PPG / Glidden (an Excel file of R, G, B
// and LRV) — loaded the same way as a public list: the app reads the brand's own palette page,
// follows the file links it shows today, and reads each file with the importers the Import button
// uses (importers.js). The page, not a fixed file address, is the source: a file's address changes
// when the brand republishes it (PPG's sits on its site host under a generated name; Benjamin
// Moore's trends file carries the year). Pages and files measured 2026-10-18 (RESEARCH §10).
// `fetch` is always injected, so nothing here reaches the network unless the app passes it in.
import { FeedError, fetchWithCause } from "./feeds.js";
import { importFile } from "./importers.js";
import { dedupeByCode } from "./normalize.js";

export const BRAND_FILE_PAGES = Object.freeze([
  {
    brand: "benjamin-moore",
    page: "https://www.benjaminmoore.com/en-us/architects-designers/download-benjamin-moore-color-palettes",
    // every collection's swatch file (Classic Colors, Color Preview, Affinity, … and the year's trends)
    files: "\\.ase$",
    every: true,
  },
  {
    brand: "ppg-glidden",
    page: "https://www.ppgpaints.com/designers/professional-color-tools/palette-downloads",
    // the current "RGB and LRV Values" workbook (2025: 2,108 colors) — newer than the page's 2020 swatch files
    files: "RGB-and-LRV-Values[^/]*\\.xlsx$",
    every: false,
  },
]);

/** The file links on a palette page that match `files`, as absolute addresses, in page order, once each. */
export function paletteLinks(html, page, files) {
  const want = new RegExp(files, "i");
  const out = [];
  for (const m of String(html).matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    let url;
    try {
      url = new URL(m[1].replaceAll("&amp;", "&"), page);
    } catch {
      continue;
    }
    if (want.test(decodeURIComponent(url.pathname)) && !out.includes(url.href)) out.push(url.href);
  }
  return out;
}

/**
 * Loads one brand's colors from the palette files its page links to; normalized rows, once per code.
 * @param {string} brand  a `BRAND_FILE_PAGES` brand key
 * @param {{ fetch: typeof fetch, signal?: AbortSignal, onFile?: (done: number, total: number) => void,
 *   pages?: typeof BRAND_FILE_PAGES }} options
 */
export async function loadPaletteFiles(brand, { fetch, signal, onFile, pages = BRAND_FILE_PAGES } = {}) {
  if (typeof fetch !== "function") throw new TypeError("loadPaletteFiles needs an injected fetch");
  const spec = pages.find((p) => p.brand === brand);
  if (!spec) throw new FeedError(`no palette page for brand "${brand}"`);
  const res = await fetchWithCause(fetch, spec.page, { headers: { accept: "text/html" }, signal });
  if (!res.ok) throw new FeedError(`HTTP ${res.status} from ${spec.page}`, { status: res.status, url: spec.page });
  let links = paletteLinks(await res.text(), spec.page, spec.files);
  if (!spec.every) links = links.slice(0, 1);
  if (!links.length) throw new FeedError(`${spec.page} links no palette file this app reads — the brand may have moved it`, { url: spec.page });
  const rows = [];
  for (const [i, url] of links.entries()) {
    signal?.throwIfAborted();
    const file = await fetchWithCause(fetch, url, { signal });
    if (!file.ok) throw new FeedError(`HTTP ${file.status} from ${url}`, { status: file.status, url });
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "palette");
    const out = await importFile(Buffer.from(await file.arrayBuffer()), name, { brand });
    rows.push(...out.rows);
    onFile?.(i + 1, links.length);
  }
  return dedupeByCode(rows);
}
