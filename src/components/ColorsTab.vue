<script setup>
// SPDX-License-Identifier: MIT
// The house page's Colors tab (PRD F4, F5): a brand's real paints for the selected part — search by
// name or number, ordered by color (a paint store's color wall) or by name, a Color family filter, a
// click paints the part — and an exact color (a hex, or the color picker) matched
// to the brand's nearest paints, each with its ΔE2000, so a color seen elsewhere becomes a paint you
// can buy. Only brands with colors on this computer are offered; adding one is the Paint colors
// page's (the app ships no brand data).
import { announce, EmptyState, reportError, schemaRules, UiButton, UiColorPicker, UiField, UiInput, UiSegmented, UiSelect, UiTag, UiToggle } from "@delebash/ui";
import { NearestQuery } from "just-house-paint-server/schemas/paints.js";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { partName } from "../services/partNames.js";
import { useHouseStore } from "../stores/house.js";
import { usePaintsStore } from "../stores/paints.js";
import { useSettingsStore } from "../stores/settings.js";
import { useUiStore } from "../stores/ui.js";

const PAGE = 120;

const { t, te } = useI18n();
const router = useRouter();
defineProps({
  // the chosen paint on this part in shade, on most of it and in light ({ shade, middle, light }), or null
  tones: { type: Object, default: null },
});
const house = useHouseStore();
const paints = usePaintsStore();
const settings = useSettingsStore();
const ui = useUiStore();
// the "On this wall" swatches' group is named by its words
const tonesId = useId();

const brand = ref(null);
const q = ref("");
const exterior = ref(true);
// discontinued colors — off, unless matching the paint already on the house
const archived = ref(false);
const rows = ref([]);
const total = ref(0);
const searching = ref(false);
const hex = ref("");
const nearest = ref([]);
const hexRule = schemaRules(NearestQuery).hex;
// by color (the near-grays, then each hue band, light to dark) or by name — the choice is kept
const order = computed({ get: () => ui.paintOrder, set: (v) => ui.setPaintOrder(v) });
const orders = computed(() => [
  { value: "color", label: t("colors.order.color") },
  { value: "name", label: t("colors.order.name") },
]);
// the Color family filter: the near-grays, then the hue families of the setting paints.colorOrder
const colorFamily = ref(null);
const familyOptions = computed(() =>
  ["neutrals", ...(settings.values["paints.colorOrder"]?.families || []).map((f) => f.key)].map((key) => ({
    value: key,
    label: te(`colors.families.${key}`) ? t(`colors.families.${key}`) : key,
  })),
);
// the exact color came off the photo (the eyedropper, a part as photographed) — its light is in it
const picked = ref(false);

// brands with no colors here yet (loading, turned off, or a palette file to import) — Paint colors has them
const missingBrands = computed(() => paints.brands.length - paints.ready.length);
const brandOptions = computed(() => paints.ready.map((b) => ({ value: b.key, label: t("colors.brandCount", { brand: b.label, n: b.paintCount }) })));
const selectedName = computed(() => (house.selectedPart ? partName(house.selectedPart, { t, te }) : ""));
const current = computed(() => paints.byId[house.colors[house.selectedPart]] || null);

onMounted(() => {
  if (!brand.value) brand.value = current.value?.brand || paints.ready[0]?.key || null;
});
// the first brand's colors land while the tab is open (the first start): it is chosen then
watch(
  () => paints.ready.length,
  () => {
    if (!brand.value) brand.value = current.value?.brand || paints.ready[0]?.key || null;
  },
);

let timer = null;
// the latest search — an earlier one that answers later is dropped (a filter changed under it)
let searchSeq = 0;
async function search(more = false) {
  if (!brand.value) return;
  const seq = ++searchSeq;
  searching.value = true;
  try {
    const page = await paints.search({
      brand: brand.value,
      q: q.value.trim(),
      colorFamily: colorFamily.value,
      order: order.value,
      exterior: exterior.value,
      archived: archived.value,
      limit: PAGE,
      offset: more ? rows.value.length : 0,
    });
    if (seq !== searchSeq) return;
    rows.value = more ? [...rows.value, ...page.rows] : page.rows;
    total.value = page.total;
  } catch (e) {
    if (seq === searchSeq) reportError(e);
  } finally {
    if (seq === searchSeq) searching.value = false;
  }
}
// the tab left: a pick still answering says nothing any more
let gone = false;
onBeforeUnmount(() => {
  gone = true;
  clearTimeout(timer);
});
watch([brand, exterior, archived, order, colorFamily], () => search(), { immediate: true });
// a family taken out of the setting is no longer a filter
watch(familyOptions, (opts) => {
  if (colorFamily.value && !opts.some((o) => o.value === colorFamily.value)) colorFamily.value = null;
});
watch(q, () => {
  clearTimeout(timer);
  timer = setTimeout(() => search(), 250);
});

// what a click on a paint sets: the part's new color, or the paint it has on it now (its light is
// worked out from that — the most accurate the photo allows)
const target = ref("new");
const targets = computed(() => [
  { value: "new", label: t("colors.target.new") },
  { value: "now", label: t("colors.target.now") },
]);
const nowPaint = computed(() => paints.byId[house.house?.currentPaints?.[house.selectedPart]] || null);
// the chip lit as chosen: the part's color, or (picking the paint on it now) that paint
const chosenId = computed(() => (target.value === "now" ? nowPaint.value?.id : house.colors[house.selectedPart]));

// The paints are ONE Tab stop — WAI-ARIA's roving tabindex (APG, "Keyboard navigation inside
// components"): the chosen paint's chip, else the first, and then the chip last focused; the arrow
// keys move along the chips (up and down a row of the grid as it is laid out), Home and End to the
// ends; Enter or Space picks (the chip is a button). Tab goes on to Show more and what follows.
const grid = ref(null);
const focusedId = ref(null);
const stopId = computed(() => {
  const ids = rows.value.map((p) => p.id);
  if (ids.includes(focusedId.value)) return focusedId.value;
  if (ids.includes(chosenId.value)) return chosenId.value;
  return ids[0] ?? null;
});
// the chosen paint changed (a pick, the target switched): the stop follows it, unless a chip has focus
watch(chosenId, () => {
  if (!grid.value?.contains(document.activeElement)) focusedId.value = null;
});
/** How many chips one row of the grid holds: the chips that share the first one's top. */
function perRow(chips) {
  const n = chips.findIndex((c) => c.offsetTop !== chips[0].offsetTop);
  return n > 0 ? n : chips.length;
}
function onGridKey(e) {
  const chips = [...grid.value.querySelectorAll(".chip")];
  const i = chips.indexOf(e.target.closest?.(".chip"));
  if (i < 0) return;
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: perRow(chips), ArrowUp: -perRow(chips) }[e.key];
  const to = e.key === "Home" ? 0 : e.key === "End" ? chips.length - 1 : step !== undefined ? i + step : null;
  if (to === null) return;
  e.preventDefault();
  // past either end (or a row with no chip below) focus stays where it is, as in APG's grid
  if (to >= 0 && to < chips.length) chips[to].focus();
}

async function choose(paint) {
  if (!house.selectedPart) return;
  paints.remember([paint]);
  if (target.value === "new") {
    house.setColor(house.selectedPart, paint.id);
    return;
  }
  try {
    await house.setCurrentPaint(house.selectedPart, paint.id);
    target.value = "new";
  } catch (e) {
    reportError(e);
  }
}
async function clearNow() {
  try {
    await house.setCurrentPaint(house.selectedPart, null);
  } catch (e) {
    reportError(e);
  }
}

// "An exact color" (its heading, brought into view) and its form (its rule's error cleared as the hex is changed:
// with lazy-rules "ondemand" it stayed after the hex was fixed — the sixteenth review)
const exactHeading = ref(null);
// the hex the matches shown are for (null before the first search)
const matchedHex = ref(null);
const exactForm = ref(null);
function onHexInput() {
  picked.value = false;
  exactForm.value?.resetValidation();
}

// a color read off the photo: into "An exact color", matched at once — and shown: the panel opens the tab at its
// top and the matches are far below it, so they are brought into view and said (a keyboard Pick a color showed and
// said nothing — the sixteenth review)
watch(
  () => house.pickedColor,
  async (p) => {
    if (!p) return;
    const got = house.takePickedColor();
    hex.value = got.hex;
    picked.value = true;
    if (await match()) {
      // once the color grid's first search has landed — it pushes the heading thousands of pixels down when it does
      // (a pick from another tab opens this one with the grid still loading: the matches stayed out of view — the
      // seventeenth review); no smooth scroll, which would aim at where the heading was
      await gridSettled();
      if (gone) return;
      exactHeading.value?.scrollIntoView?.({ block: "start" });
      announce(t("colors.exact.found", { n: nearest.value.length, hex: hex.value }, nearest.value.length));
    }
  },
  { immediate: true },
);

/** A chip's name starts with what it shows — its name, then its number — and then says the brand (WCAG 2.5.3: the
 *  name held "SW T-121 Shade 21" for a chip showing "Shade 21 T-121"). */
const brandLabels = computed(() => Object.fromEntries(paints.brands.map((b) => [b.key, b.label])));
const chipName = (p) => [p.name, p.code].filter(Boolean).join(" ") + (brandLabels.value[p.brand] ? ` — ${brandLabels.value[p.brand]}` : "");

/** The color grid has its first page: the search the tab's opening started (it starts a tick after the brand is
 *  set) has answered. */
async function gridSettled() {
  await nextTick();
  await nextTick();
  while (searching.value) {
    await new Promise((resolve) => {
      const stop = watch(searching, (on) => {
        if (!on) {
          stop();
          resolve();
        }
      });
    });
  }
  await nextTick();
}

/** The brand's nearest paints to the hex; true once they are shown. */
async function match() {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex.value)) return false;
  try {
    nearest.value = await paints.nearest(hex.value, { brand: brand.value, k: 6, exterior: exterior.value });
    matchedHex.value = hex.value;
    paints.remember(nearest.value.map((n) => n.paint));
    return true;
  } catch (e) {
    reportError(e);
    return false;
  }
}
</script>

<template>
  <div class="colors">
    <EmptyState v-if="!paints.ready.length && paints.autoLoadingBrands" icon="Palette" compact :message="t('colors.loadingBrands')" />
    <EmptyState
      v-else-if="!paints.ready.length" icon="Palette" compact :message="t('colors.none')" :action-label="t('colors.addBrand')"
      @action="router.push('/colors')"
    />
    <template v-else>
      <p class="hint">
        {{ house.selectedPart ? t("colors.forPart", { part: selectedName }) : t("colors.pickPart") }}
      </p>
      <div v-if="current" class="colors__current">
        <span class="swatch swatch--big" :style="{ background: current.hex }" aria-hidden="true" />
        <span>{{ current.displayName }}</span>
        <!-- an action, named as one ("No color" read as the part's state — the visual review, 2026-10-20) -->
        <UiButton intent="secondary" size="small" :label="t('colors.clear')" @click="house.setColor(house.selectedPart, null)" />
      </div>
      <!-- what a click on a paint sets: the new color, or the paint the part has on it now -->
      <div class="colors__target">
        <UiSegmented v-model="target" :options="targets" :aria-label="t('colors.target.label')" />
      </div>
      <p v-if="target === 'now'" class="hint">{{ t("colors.now.hint") }}</p>
      <div v-if="nowPaint" class="colors__current colors__now">
        <span class="hint">{{ t("colors.now.label") }}</span>
        <span class="swatch" :style="{ background: nowPaint.hex }" aria-hidden="true" />
        <span>{{ nowPaint.displayName }}</span>
        <UiButton intent="ghost" size="small" :label="t('colors.now.clear')" @click="clearNow" />
      </div>
      <!-- the same paint as it shows on this wall: in shade, on most of it, in light (the chip at the
           photo's own light) — why the painted wall looks darker than the chip -->
      <div v-if="current && tones" class="colors__tones" role="group" :aria-labelledby="tonesId">
        <span :id="tonesId" class="hint">{{ t("colors.tones.label") }}</span>
        <span v-for="level in ['shade', 'middle', 'light']" :key="level" class="colors__tone">
          <!-- a swatch is a picture of its colour: its hex is its name, for a screen reader too (the tooltip
               adds nothing to it — a title equal to the name was read twice) -->
          <span v-tooltip="tones[level]" class="swatch" role="img" :style="{ background: tones[level] }" :aria-label="tones[level]" />
          <span class="hint">{{ t(`colors.tones.${level}`) }}</span>
        </span>
      </div>
      <div class="colors__filters">
        <UiSelect v-model="brand" :options="brandOptions" width="name" :aria-label="t('colors.brand')" />
        <UiButton
          v-if="missingBrands" intent="ghost" size="small" :label="t('colors.moreBrands', { n: missingBrands }, missingBrands)"
          @click="router.push('/colors')"
        />
        <UiInput v-model="q" type="search" width="name" :placeholder="t('colors.search')" :aria-label="t('colors.search')" />
        <UiSelect
          v-model="colorFamily" :options="familyOptions" width="name" show-clear :placeholder="t('colors.families.label')"
          :aria-label="t('colors.families.label')"
        />
        <span class="colors__order">
          <span>{{ t("colors.order.label") }}</span>
          <UiSegmented v-model="order" :options="orders" :aria-label="t('colors.order.label')" />
        </span>
        <label class="colors__toggle">
          <UiToggle v-model="exterior" :aria-label="t('colors.exterior')" />
          <span>{{ t("colors.exterior") }}</span>
        </label>
        <label class="colors__toggle">
          <UiToggle v-model="archived" :aria-label="t('colors.archived')" />
          <span>{{ t("colors.archived") }}</span>
        </label>
      </div>
      <div ref="grid" class="colors__grid" role="group" :aria-label="t('colors.paints')" :aria-busy="searching" @keydown="onGridKey">
        <q-btn
          v-for="p in rows" :key="p.id" flat no-caps unelevated class="chip" :class="{ 'chip--on': chosenId === p.id }"
          v-tooltip="p.displayName" :aria-label="chipName(p)" :aria-pressed="chosenId === p.id ? 'true' : 'false'"
          :tabindex="stopId === p.id ? 0 : -1" :disable="!house.selectedPart" @focus="focusedId = p.id" @click="choose(p)"
        >
          <span class="chip__body">
            <span class="chip__color" :style="{ background: p.hex }" />
            <span class="chip__name">{{ p.name }}</span>
            <span class="chip__code muted">{{ p.code }}</span>
          </span>
        </q-btn>
      </div>
      <p v-if="!searching && !rows.length" class="muted">{{ t("colors.noMatch") }}</p>
      <UiButton v-if="rows.length < total" intent="ghost" :disabled="searching" :label="t('colors.more', { n: total - rows.length })" @click="search(true)" />

      <h3 ref="exactHeading" class="colors__h">{{ t("colors.exact.title") }}</h3>
      <p class="hint">{{ t("colors.exact.hint") }}</p>
      <!-- the hex is checked when Find is pressed (Quasar's lazy-rules "ondemand"): Tab through an empty box
           said "Required" (the screens review, 2026-10-20). The picker and Find sit in the field beside the box,
           top-aligned with it, so the rule's words under the box never move them -->
      <q-form ref="exactForm" @submit="match">
        <UiField :label="t('colors.exact.hex')" layout="block" for="exact-hex">
          <span class="colors__exact">
            <UiInput id="exact-hex" v-model="hex" width="token" @update:model-value="onHexInput" :placeholder="t('colors.exact.placeholder')" lazy-rules="ondemand" :rules="hexRule" />
            <UiColorPicker v-model="hex" :aria-label="t('colors.exact.pick')" @update:model-value="onHexInput" />
            <UiButton type="submit" intent="secondary" :label="t('colors.exact.match')" />
          </span>
        </UiField>
      </q-form>
      <p v-if="picked" class="hint">{{ t("colors.exact.picked") }}</p>
      <!-- a search that found nothing says so where its matches would be (it was said to a screen reader alone) -->
      <p v-if="matchedHex && !nearest.length" class="muted">{{ t("colors.exact.none", { hex: matchedHex }) }}</p>
      <q-list v-if="nearest.length" class="colors__nearest" dense>
        <q-item v-for="n in nearest" :key="n.paint.id" clickable class="nearest" :disable="!house.selectedPart" @click="choose(n.paint)">
          <q-item-section avatar class="nearest__swatch"><span class="nearest__color" :style="{ background: n.paint.hex }" /></q-item-section>
          <q-item-section>{{ n.paint.displayName }}</q-item-section>
          <q-item-section side>
            <!-- green is a close match to the color: the words say it too, for a screen reader -->
            <UiTag :intent="n.deltaE <= 2 ? 'success' : 'secondary'" :title="t('colors.exact.deltaEHint')">
              {{ t("partsTab.deltaE", { n: n.deltaE.toFixed(1) }) }}<span class="visually-hidden"> {{ n.deltaE <= 2 ? t("colors.exact.deltaEClose") : t("colors.exact.deltaEFar") }}</span>
            </UiTag>
          </q-item-section>
        </q-item>
      </q-list>
    </template>
  </div>
</template>

<style scoped>
.colors__target {
  margin: 0 0 var(--sp-2);
}
/* the hex box, the picker and Find on one row, on the box's middle (the box's rule message, shown only after a
   failed Find and gone as it is typed into, moves them a little meanwhile) */
.colors__exact {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.colors__tones {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin: 0 0 var(--sp-3);
}
.colors__order {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  white-space: nowrap;
}
.colors__tone {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
}
.colors__current,
.colors__filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
}
.colors__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}
.colors__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 6px;
  margin-bottom: var(--sp-2);
}
.colors__h {
  font-size: var(--fs-small);
  font-weight: 600;
  margin: var(--sp-4) 0 var(--sp-1);
}
.colors__nearest {
  margin: var(--sp-2) 0 0;
}
.nearest__swatch {
  min-width: 0;
  padding-right: var(--sp-2);
}
.nearest__color {
  display: block;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid var(--border);
}
/* its edge 3:1 or more on the panel's ground (WCAG 1.4.11 — a white paint's chip on a white panel had none: 1.25:1) */
.chip {
  padding: 4px;
  border: 1px solid var(--border-field, var(--border));
  border-radius: 6px;
  font-size: var(--fs-small);
}
/* chosen: a 2 px accent edge (a border, not a box-shadow — the focus ring is the box-shadow, and the
   chosen chip is where Tab lands); the padding gives back the pixel the border takes */
.chip--on {
  border: 2px solid var(--accent);
  padding: 3px;
}
.chip__body {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  width: 100%;
  min-width: 0;
  text-align: left;
}
.chip__color {
  height: 36px;
  border-radius: 4px;
}
.chip__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip__code {
  font-size: var(--fs-small);
}
</style>
