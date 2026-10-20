// SPDX-License-Identifier: MIT
// The renderer's stores (houses, paints, the open house) and the server-job helper, over a mocked
// kit transport — what each action asks the server, and what the screen then holds.
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";

const calls = [];
const answers = new Map();
const answer = (key, value) => answers.set(key, value);
const reply = (method, path, body) => {
  calls.push([method, path, body]);
  for (const [k, v] of answers) if (`${method} ${path}`.startsWith(k)) return typeof v === "function" ? v(body) : structuredClone(v);
  throw new Error(`no answer for ${method} ${path}`);
};
vi.mock("@delebash/ui", () => ({
  get: async (p) => reply("GET", p),
  post: async (p, b) => reply("POST", p, b),
  patch: async (p, b) => reply("PATCH", p, b),
  del: async (p) => reply("DELETE", p),
  request: async (p, o) => reply(o?.method || "GET", p, o?.body),
  postForm: async (p, form) => reply("POST", p, Object.fromEntries(form.entries())),
  // the kit's runner: one task; the helper reports progress on it
  withAiTask: async (opts, fn) => {
    const controller = new AbortController();
    const progress = [];
    calls.push(["TASK", opts.feature, opts.label]);
    const out = await fn({ signal: controller.signal, setProgress: (d, t) => progress.push([d, t]) });
    calls.push(["PROGRESS", progress]);
    // the kit's own rule (services/appTask.js): `{ result }` is unwrapped
    return out && typeof out === "object" && "result" in out ? out.result : out;
  },
}));

const { useHousesStore } = await import("./houses.js");
const { usePaintsStore } = await import("./paints.js");
const { schemeColors, useHouseStore } = await import("./house.js");
const { jobError, runServerJob } = await import("../services/jobs.js");

beforeEach(() => {
  setActivePinia(createPinia());
  calls.length = 0;
  answers.clear();
});

const HOUSE = { id: "h1", name: "Home", updatedAt: "2026-10-18T10:00:00Z", displayWidth: 4, displayHeight: 2 };

describe("runServerJob", () => {
  test("its waits between polls leave no listener behind on the task's signal", async () => {
    let n = 0;
    answer("GET /v1/jobs/j1", () => (++n < 4 ? { id: "j1", state: "running", progress: n / 4 } : { id: "j1", state: "done", result: 1 }));
    const added = [];
    const removed = [];
    const real = AbortSignal.prototype.addEventListener;
    const realRemove = AbortSignal.prototype.removeEventListener;
    AbortSignal.prototype.addEventListener = function (type, fn, o) {
      if (type === "abort") added.push(fn);
      return real.call(this, type, fn, o);
    };
    AbortSignal.prototype.removeEventListener = function (type, fn, o) {
      if (type === "abort") removed.push(fn);
      return realRemove.call(this, type, fn, o);
    };
    try {
      await runServerJob({ start: async () => ({ id: "j1", state: "running", progress: 0 }), feature: "x", label: "x", pollMs: 1 });
    } finally {
      AbortSignal.prototype.addEventListener = real;
      AbortSignal.prototype.removeEventListener = realRemove;
    }
    // one for the job's own cancel, one per wait — every wait's taken off again
    expect(added.length - 1).toBe(4);
    expect(removed.length).toBe(4);
  });

  test("polls the job until it ends and resolves with its result", async () => {
    let n = 0;
    answer("GET /v1/jobs/j1", () => (++n < 2 ? { id: "j1", state: "running", progress: 0.5 } : { id: "j1", state: "done", result: { parts: 3 } }));
    const r = await runServerJob({ start: async () => ({ id: "j1", state: "running", progress: 0.1 }), feature: "parts.find", label: "Find parts", pollMs: 1 });
    expect(r).toEqual({ parts: 3 });
    expect(calls.find((c) => c[0] === "PROGRESS")[1]).toEqual([
      [10, 100],
      [50, 100],
    ]);
  });

  test("a failed job throws an error the screen can report; a cancelled one an AbortError", async () => {
    answer("GET /v1/jobs/j2", { id: "j2", state: "error", error: { message: "model file damaged", status: 500 } });
    await expect(runServerJob({ start: async () => ({ id: "j2", state: "running" }), feature: "x", label: "x", pollMs: 1 })).rejects.toMatchObject({
      message: "model file damaged",
      status: 500,
    });
    await expect(runServerJob({ start: async () => ({ id: "j3", state: "cancelled" }), feature: "x", label: "x" })).rejects.toMatchObject({ name: "AbortError" });
    expect(jobError({ error: null }).status).toBe(500);
    // the server's title for what failed is the screen's heading; its words the detail
    const err = jobError({ error: { message: "sd-cli failed (exit 3)", status: null, title: "The AI photo didn't finish" } });
    expect(err.problem).toEqual({ title: "The AI photo didn't finish", detail: "sd-cli failed (exit 3)" });
  });
});

describe("the houses store", () => {
  test("load sorts newest first; add, rename and remove keep the list", async () => {
    answer("GET /v1/houses", [{ ...HOUSE, id: "a", updatedAt: "2026-10-01T00:00:00Z" }, { ...HOUSE, id: "b" }]);
    const s = useHousesStore();
    await s.load();
    expect(s.items.map((h) => h.id)).toEqual(["b", "a"]);
    answer("POST /v1/houses", { ...HOUSE, id: "c", updatedAt: "2026-10-19T00:00:00Z" });
    await s.add(new File(["x"], "front.jpg", { type: "image/jpeg" }));
    expect(s.items[0]).toMatchObject({ id: "c", designCount: 0 });
    answer("PATCH /v1/houses/c", { ...HOUSE, id: "c", name: "Cottage", updatedAt: "2026-10-19T00:00:00Z" });
    await s.rename("c", "Cottage");
    expect(s.items[0].name).toBe("Cottage");
    answer("DELETE /v1/houses/c", null);
    await s.remove("c");
    expect(s.items.map((h) => h.id)).toEqual(["b", "a"]);
    // already gone (another window, a second click): what was asked, not an error
    answer("DELETE /v1/houses/b", () => {
      throw Object.assign(new Error("Not Found"), { status: 404 });
    });
    await s.remove("b");
    expect(s.items.map((h) => h.id)).toEqual(["a"]);
    answer("DELETE /v1/houses/a", () => {
      throw Object.assign(new Error("the disk"), { status: 500 });
    });
    await expect(s.remove("a")).rejects.toMatchObject({ status: 500 });
    expect(s.items.map((h) => h.id)).toEqual(["a"]);
  });
});

describe("the paints store", () => {
  test("search remembers the paints it saw; a paint by id is fetched once", async () => {
    answer("GET /v1/paints?", { total: 1, rows: [{ id: "behr:1", name: "Snow", hex: "#ffffff" }] });
    const p = usePaintsStore();
    const page = await p.search({ q: "snow", brand: "behr" });
    expect(page.total).toBe(1);
    expect(calls.at(-1)[1]).toBe("/v1/paints?brand=behr&q=snow&exterior=true&archived=false&limit=120&offset=0");
    expect(await p.paint("behr:1")).toMatchObject({ name: "Snow" });
    expect(calls.filter((c) => c[1].startsWith("/v1/paints/behr"))).toHaveLength(0);
  });

  test("a brand's colors loaded again, imported or removed leave the cache: the next lookup asks the server", async () => {
    const SNOW = { id: "behr:1", brand: "behr", name: "Snow", hex: "#ffffff" };
    const NAVY = { id: "valspar:9", brand: "valspar", name: "Navy", hex: "#1f2a44" };
    answer("GET /v1/paints/behr%3A1", SNOW);
    answer("GET /v1/paints/valspar%3A9", NAVY);
    answer("GET /v1/paints/behr%3AGONE", () => {
      throw Object.assign(new Error("Not Found"), { status: 404 });
    });
    answer("GET /v1/brands", []);
    const p = usePaintsStore();
    await p.paints(["behr:1", "valspar:9", "behr:GONE"]);
    expect(Object.keys(p.byId)).toEqual(["behr:1", "valspar:9"]);
    expect(p.missing).toEqual({ "behr:GONE": true });
    const asked = () => calls.filter((c) => c[1].startsWith("/v1/paints/")).map((c) => decodeURIComponent(c[1]));
    // the brand removed: its paints and its missing marks go — the other brand's stay
    answer("DELETE /v1/brands/behr", null);
    await p.clearBrand("behr");
    expect(Object.keys(p.byId)).toEqual(["valspar:9"]);
    expect(p.missing).toEqual({});
    expect(p.brandsChanged).toBe(1);
    // looked up again, the server says it is gone now: marked missing, never painted from the cache
    answer("GET /v1/paints/behr%3A1", () => {
      throw Object.assign(new Error("Not Found"), { status: 404 });
    });
    calls.length = 0;
    expect(await p.paints(["behr:1", "valspar:9"])).toEqual([null, NAVY]);
    expect(asked()).toEqual(["/v1/paints/behr:1"]);
    expect(p.missing).toEqual({ "behr:1": true });
    // loaded again (a new list): its marks go, and the paint comes back as the server has it now
    answer("POST /v1/brands/behr/load", { id: "j1", state: "done", result: { paints: 2 } });
    answer("GET /v1/paints/behr%3A1", { ...SNOW, hex: "#fefefe" });
    await p.loadFeed("behr", "Loading Behr");
    expect(p.missing).toEqual({});
    expect(p.brandsChanged).toBe(2);
    expect((await p.paints(["behr:1"]))[0].hex).toBe("#fefefe");
    // a palette file imported for it: the same
    answer("POST /v1/paints/import", { brand: "behr", paintCount: 3, lost: [] });
    await p.importFile("behr", new File(["x"], "behr.csv"));
    expect(Object.keys(p.byId)).toEqual(["valspar:9"]);
    expect(p.brandsChanged).toBe(3);
  });

  test("a lookup that began before its brand was loaded again or removed doesn't put the old paint back", async () => {
    const SNOW = { id: "behr:1", brand: "behr", name: "Snow", hex: "#ffffff" };
    const NAVY = { id: "valspar:9", brand: "valspar", name: "Navy", hex: "#1f2a44" };
    const held = [];
    const hold = (value, fail = false) => () => new Promise((resolve, reject) => held.push(() => (fail ? reject(value) : resolve(value))));
    answer("GET /v1/paints/behr%3A1", hold(SNOW));
    answer("GET /v1/paints/behr%3AGONE", hold(Object.assign(new Error("Not Found"), { status: 404 }), true));
    answer("GET /v1/paints/valspar%3A9", hold(NAVY));
    answer("GET /v1/paints?", hold({ total: 1, rows: [{ ...SNOW, id: "behr:2" }] }));
    answer("DELETE /v1/brands/behr", null);
    answer("GET /v1/brands", []);
    const p = usePaintsStore();
    const looking = p.paints(["behr:1", "behr:GONE", "valspar:9"]);
    const searching = p.search({ brand: "behr" });
    await vi.waitFor(() => expect(held).toHaveLength(4));
    // the brand removed while they wait; then the server's answers from before arrive
    await p.clearBrand("behr");
    for (const answerNow of held) answerNow();
    expect(await looking).toEqual([null, null, NAVY]);
    await searching;
    expect(Object.keys(p.byId)).toEqual(["valspar:9"]);
    expect(p.missing).toEqual({});
    // a lookup begun after it: kept as usual
    answer("GET /v1/paints/behr%3A1", SNOW);
    expect(await p.paints(["behr:1"])).toEqual([SNOW]);
  });

  test("out of the box the brands load by themselves: the empty ones set to load, one after another, a failure doesn't stop the rest", async () => {
    answer("GET /v1/brands", [
      { key: "sherwin-williams", label: "Sherwin-Williams", feed: true, paintCount: 0 },
      { key: "behr", label: "Behr", feed: true, paintCount: 5178 },
      { key: "valspar", label: "Valspar", feed: true, paintCount: 0 },
      { key: "dutch-boy", label: "Dutch Boy", feed: true, paintCount: 0 },
      { key: "benjamin-moore", label: "Benjamin Moore", feed: false, paintCount: 0 },
    ]);
    answer("POST /v1/brands/sherwin-williams/load", () => {
      throw new Error("the site refused");
    });
    answer("POST /v1/brands/dutch-boy/load", { id: "j-db", state: "done", result: { paints: 1340 } });
    const p = usePaintsStore();
    const label = (b) => `Loading ${b.label}`;
    // Valspar is turned off; Behr has its colors; Benjamin Moore has no list to fetch. A second call
    // while the first runs joins it — nothing loads twice.
    await Promise.all([p.autoLoadBrands({ autoLoad: { valspar: false }, label }), p.autoLoadBrands({ autoLoad: {}, label })]);
    expect(calls.filter((c) => c[0] === "POST").map((c) => c[1])).toEqual(["/v1/brands/sherwin-williams/load", "/v1/brands/dutch-boy/load"]);
    expect(calls.filter((c) => c[0] === "TASK").map((c) => c[2])).toEqual(["Loading Sherwin-Williams", "Loading Dutch Boy"]);
  });
});

describe("the open house", () => {
  async function opened() {
    answer("GET /v1/houses/h1/parts", [
      { key: "body", paintable: true, area: 10 },
      { key: "trim", paintable: true, area: 4 },
      { key: "roof", paintable: false, area: 6 },
    ]);
    answer("GET /v1/houses/h1/designs", [{ id: "d1", name: "Classic", colors: { body: "p:1" } }]);
    answer("GET /v1/houses/h1/renders", []);
    answer("GET /v1/houses/h1", HOUSE);
    const s = useHouseStore();
    await s.open("h1");
    return s;
  }

  test("opening selects the first paintable part; colors are a draft until saved", async () => {
    const s = await opened();
    expect(s.selectedPart).toBe("body");
    expect(s.dirty).toBe(false);
    s.setColor("body", "p:2");
    expect(s.dirty).toBe(true);
    s.openDesign("d1");
    expect(s.colors).toEqual({ body: "p:1" });
    expect(s.dirty).toBe(false);
    s.setColor("trim", "p:3");
    answer("PATCH /v1/designs/d1", (b) => ({ id: "d1", name: "Classic", colors: b.colors }));
    await s.saveDesign();
    expect(s.dirty).toBe(false);
    s.setColor("trim", null);
    expect(s.colors).toEqual({ body: "p:1" });
  });

  test("a scheme paints the roles' parts this house has", async () => {
    const s = await opened();
    const scheme = { roles: { body: { paint: { id: "p:b" } }, trim: { paint: { id: "p:t" } }, accent: { paint: { id: "p:a" } } } };
    const roleParts = { body: ["body", "chimney"], trim: ["trim"], accent: ["frontDoor", "shutters"] };
    s.applyScheme(scheme, roleParts);
    expect(s.colors).toEqual({ body: "p:b", trim: "p:t" }); // no frontDoor or shutters on this house
    expect(schemeColors(scheme, ["frontDoor", "shutters"], roleParts)).toEqual({ frontDoor: "p:a", shutters: "p:a" });
  });

  test("a box changes parts on the server and marks their masks to reload; the brush saves a PNG", async () => {
    const s = await opened();
    answer("POST /v1/houses/h1/parts/trim/box", { changed: ["body", "trim"], parts: [{ key: "body", paintable: true, area: 8 }, { key: "trim", paintable: true, area: 6 }] });
    expect(await s.box("trim", { x0: 0, y0: 0, x1: 2, y1: 2 })).toEqual(["body", "trim"]);
    expect(s.maskVersions).toEqual({ body: 1, trim: 1 });
    expect(calls.at(-1)[2]).toEqual({ x0: 0, y0: 0, x1: 2, y1: 2, mode: "add" });
    answer("PUT /v1/houses/h1/parts/trim/mask", { key: "trim", paintable: true, area: 7 });
    await s.saveMask("trim", new Blob(["png"]));
    expect(s.parts.find((p) => p.key === "trim").area).toBe(7);
    expect(s.maskVersions.trim).toBe(2);
  });

  test("each long action writes only into the house it started on", async () => {
    const s = await opened();
    // an AI photo of h1 that ends after h2 opened: kept on the server, not listed under h2
    let finish;
    answer("POST /v1/houses/h1/aiphoto", () => new Promise((r) => (finish = r)));
    const photo = s.aiPhoto("AI photo");
    answer("GET /v1/houses/h2/parts", [{ key: "trim", paintable: true, area: 3 }]);
    answer("GET /v1/houses/h2/designs", []);
    answer("GET /v1/houses/h2/renders", []);
    answer("GET /v1/houses/h2", { ...HOUSE, id: "h2", name: "Cabin" });
    await s.open("h2");
    finish({ id: "j1", state: "done", result: { id: "r1", houseId: "h1" } });
    await photo;
    expect(s.house.id).toBe("h2");
    expect(s.renders).toEqual([]);
    // a stroke drawn on h1 and saved after leaving it goes to h1, and leaves h2's parts alone
    answer("PUT /v1/houses/h1/parts/body/mask", { key: "body", paintable: true, area: 9 });
    await s.saveMask("body", new Blob(["png"]), "h1");
    expect(calls.at(-1).slice(0, 2)).toEqual(["PUT", "/v1/houses/h1/parts/body/mask"]);
    expect(s.parts.map((p) => p.key)).toEqual(["trim"]);
  });

  test("opening another house shows nothing of the last one while it loads; a late answer loses", async () => {
    const s = await opened();
    let slow;
    answer("GET /v1/houses/h3/parts", () => new Promise((r) => (slow = r)));
    answer("GET /v1/houses/h3/designs", []);
    answer("GET /v1/houses/h3/renders", []);
    answer("GET /v1/houses/h3", { ...HOUSE, id: "h3" });
    const first = s.open("h3");
    expect(s.house).toBeNull();
    expect(s.parts).toEqual([]);
    answer("GET /v1/houses/h4/parts", []);
    answer("GET /v1/houses/h4/designs", []);
    answer("GET /v1/houses/h4/renders", []);
    answer("GET /v1/houses/h4", { ...HOUSE, id: "h4" });
    await s.open("h4");
    slow([{ key: "body", paintable: true, area: 1 }]);
    await first;
    expect(s.house.id).toBe("h4");
  });

  test("the AI photo sends the colors on screen and keeps the render", async () => {
    const s = await opened();
    s.setColor("body", "p:1");
    answer("POST /v1/houses/h1/aiphoto", { id: "j9", state: "done", result: { id: "r1", houseId: "h1" } });
    const r = await s.aiPhoto("AI photo");
    expect(r.id).toBe("r1");
    expect(calls.find((c) => c[1] === "/v1/houses/h1/aiphoto")[2]).toEqual({ colors: { body: "p:1" } });
    expect(s.renders.map((x) => x.id)).toEqual(["r1"]);
  });
});
