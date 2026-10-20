// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// Your houses mounted for real — Vue Test Utils with Quasar installed as the app installs it and
// the kit's UI wired by installLlmUi (vuejs.org/guide/scaling-up/testing; app-structure §18) —
// against a stand-in server answering /v1/houses the way the real one does. It proves the states of
// §17 (loading, empty, failed with Retry, the cards), adding a photo (sent as a file, then the
// house opens), the rename form of §15 (the rule from the route's own schema, a server 422 under
// its field) and that a delete asks first.
import { _resolveDialog, dialogState, installLlmUi, LlmUiHosts } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { i18n } from "../i18n/index.js";
import HomePage from "./HomePage.vue";

// Quasar's CLI makes every q-* tag available to a template (its build-time auto-import); in a test
// the components are registered instead.
const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));

// ── a stand-in server, in the real one's shapes ─────────────────────────────
let server;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" } });
const at = (n) => `2026-10-1${n}T10:00:00.000Z`;
const houseRow = (id, name, n = 1, designCount = 0) => ({
  id,
  name,
  originalFile: "original.jpg",
  width: 800,
  height: 600,
  displayWidth: 800,
  displayHeight: 600,
  partsFoundAt: null,
  createdAt: at(n),
  updatedAt: at(n),
  designCount,
});

function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  server.calls.push(`${method} ${url.pathname}`);
  if (url.pathname === "/v1/houses" && method === "GET") {
    if (server.down) return Promise.resolve(json({ type: "x/internal", title: "Internal Server Error", status: 500, detail: "disk on fire", requestId: "rid-500" }, 500));
    return server.list ?? Promise.resolve(json(server.houses));
  }
  if (url.pathname === "/v1/houses" && method === "POST") {
    server.uploaded = init.body.get("file");
    const house = houseRow("h-new", "my-house", 7);
    server.houses.unshift(house);
    return Promise.resolve(json(house, 201));
  }
  const m = url.pathname.match(/^\/v1\/houses\/([^/]+)$/);
  if (m && method === "PATCH") {
    const body = JSON.parse(init.body);
    if (server.refuseRename) {
      return Promise.resolve(
        json(
          {
            type: "https://just-house-paint.local/errors/validation-error",
            title: "Validation Error",
            status: 422,
            detail: "Request body failed validation.",
            errors: [{ loc: ["body", "name"], msg: "refused", type: "string_too_long", ctx: { max_length: 80 } }],
            requestId: "rid-422",
          },
          422,
        ),
      );
    }
    const house = server.houses.find((x) => x.id === m[1]);
    Object.assign(house, body);
    return Promise.resolve(json(house));
  }
  if (m && method === "DELETE") {
    server.houses = server.houses.filter((x) => x.id !== m[1]);
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return Promise.resolve(json({}));
}

let wrapper;
let router;
async function mountPage() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: HomePage },
      { path: "/house/:id", component: { render: () => null } },
    ],
  });
  router.push("/");
  await router.isReady();
  const Host = { render: () => [h(quasar.QLayout, { view: "hhh lpr fff" }, () => h(quasar.QPageContainer, () => h(HomePage))), h(LlmUiHosts)] };
  wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [
        [quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }],
        i18n,
        createPinia(),
        router,
        { install: (app) => installLlmUi(app, { i18n, external: false }) },
      ],
      // the kit's v-tooltip stood in for: its words kept on the element, to be read back
      directives: { tooltip: { mounted: (el, b) => (el.dataset.tooltip = b.value), updated: (el, b) => (el.dataset.tooltip = b.value) } },
    },
  });
  await flushPromises();
  return wrapper;
}
const text = () => document.body.textContent;
const byText = (selector, words) => [...document.body.querySelectorAll(selector)].find((el) => el.textContent.includes(words));
const click = async (el) => {
  el.click();
  await flushPromises();
};

beforeEach(() => {
  server = { houses: [], calls: [] };
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("the states", () => {
  test("loading shows the loading state, never the empty one", async () => {
    let answer;
    server.list = new Promise((resolve) => {
      answer = resolve;
    });
    await mountPage();
    expect(text()).not.toContain("No houses yet");
    answer(json([]));
    await flushPromises();
    expect(text()).toContain("No houses yet");
  });

  test("empty: the one action that fills it", async () => {
    await mountPage();
    expect(text()).toContain("No houses yet");
    expect(byText(".ui-empty button, .ui-empty .q-btn", "Add a photo")).toBeTruthy();
  });

  test("failed: the reason and Retry, which loads again", async () => {
    server.down = true;
    await mountPage();
    expect(text()).toContain("Couldn't load your houses");
    expect(text()).toContain("disk on fire");
    server.down = false;
    server.houses = [houseRow("h1", "Back again")];
    await click(byText("button", "Retry"));
    expect(text()).toContain("Back again");
    expect(text()).not.toContain("Couldn't load your houses");
  });

  test("a card per house, most recently changed first, with its designs", async () => {
    server.houses = [houseRow("h2", "Lake house", 2, 3), houseRow("h1", "Main street", 1, 1)];
    await mountPage();
    const names = [...document.body.querySelectorAll(".houses__name")].map((el) => el.textContent.trim());
    expect(names).toEqual(["Lake house", "Main street"]);
    // a name too long for its card is cut with an ellipsis: the whole of it shows on hover — a tooltip, not a title
    // (a title equal to the text was read twice)
    expect([...document.body.querySelectorAll(".houses__name")].map((el) => el.dataset.tooltip)).toEqual(["Lake house", "Main street"]);
    expect(document.body.querySelector(".houses__name").hasAttribute("title")).toBe(false);
    expect(text()).toContain("3 designs");
    expect(text()).toContain("1 design");
  });
});

test("adding a photo sends the file and opens the house", async () => {
  await mountPage();
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "my-house.jpg", { type: "image/jpeg" });
  wrapper.findComponent(quasar.QFile).vm.$emit("update:modelValue", file);
  await flushPromises();
  expect(server.calls).toContain("POST /v1/houses");
  expect(server.uploaded.name).toBe("my-house.jpg");
  expect(router.currentRoute.value.path).toBe("/house/h-new");
});

test("a rename checks the route's own rule, and a server 422 lands under the field", async () => {
  const type = async (el, value) => {
    el.value = value;
    el.dispatchEvent(new Event("input"));
    await flushPromises();
  };
  const submit = async () => {
    await click(byText(".form__actions button", "Save"));
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
  };
  server.houses = [houseRow("h1", "Main street")];
  await mountPage();
  await click(document.body.querySelector('[aria-label="Rename “Main street”"]'));
  const input = document.body.querySelector("#name-dialog-input");
  expect(input.value).toBe("Main street");

  // the schema's minLength: an empty name never reaches the server
  await type(input, "");
  await submit();
  expect(text()).toContain("Required"); // kit.validation.required, from schemaRules(HousePatch)
  expect(server.calls).not.toContain("PATCH /v1/houses/h1");

  server.refuseRename = true;
  await type(input, "A name the server refuses");
  byText(".form__actions button", "Save").focus(); // as a click leaves it (then Save is off while it saves)
  await submit();
  expect(server.calls).toContain("PATCH /v1/houses/h1");
  expect(text()).toContain("At most 80 characters"); // kit.validation.maxLength, from the 422's ctx
  expect(document.querySelector(".ui-modal")).not.toBeNull(); // the dialog stays open
  expect(document.activeElement).toBe(input); // and the focus is back in the field (the twentieth review: <body>)

  server.refuseRename = false;
  await type(input, "Lake house");
  await submit();
  expect([...document.body.querySelectorAll(".houses__name")].map((el) => el.textContent.trim())).toEqual(["Lake house"]);
});

test("a delete asks first, naming the house", async () => {
  server.houses = [houseRow("h1", "Main street")];
  await mountPage();
  await click(document.body.querySelector('[aria-label="Delete “Main street”"]'));
  expect(dialogState.open).toBe(true);
  expect(dialogState.options.message).toContain("Main street");
  expect(server.calls).not.toContain("DELETE /v1/houses/h1");
  _resolveDialog(true);
  await flushPromises();
  expect(server.calls).toContain("DELETE /v1/houses/h1");
  expect(text()).toContain("No houses yet");
});

test("a house's name inside the words is isolated (FSI … PDI): a right-to-left name leaves the quotes in place", async () => {
  server.houses = [houseRow("h1", "בית הים")];
  await mountPage();
  // the card's buttons and photo: the name between FIRST STRONG ISOLATE and POP DIRECTIONAL ISOLATE
  const labels = [...document.body.querySelectorAll(".houses__card [aria-label]")].map((el) => el.getAttribute("aria-label"));
  expect(labels).toEqual(["Open \u2068בית הים\u2069", "Rename “\u2068בית הים\u2069”", "Delete “\u2068בית הים\u2069”"]);
  // the delete's question too
  await click(document.body.querySelector(".houses__card [aria-label^='Delete']"));
  expect(dialogState.options.message).toContain("“\u2068בית הים\u2069”, its photo");
  _resolveDialog(false);
  await flushPromises();
  // the name on its own (the card's title) is as written
  expect(document.body.querySelector(".houses__name").textContent.trim()).toBe("בית הים");
});
