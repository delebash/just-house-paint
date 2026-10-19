<script setup>
// SPDX-License-Identifier: MIT
// The house page's Colors tab (PRD F4, F5): a brand's real paints for the selected part — search by
// name or number, ordered by color (a paint store's color wall) or by name, a Color family filter, a
// click paints the part — and an exact color (a hex, or the color picker) matched
// to the brand's nearest paints, each with its ΔE2000, so a color seen elsewhere becomes a paint you
// can buy. Only brands with colors on this computer are offered; adding one is the Paint colors
// page's (the app ships no brand data).
import { EmptyState, reportError, schemaRules, UiButton, UiColorPicker, UiField, UiInput, UiSegmented, UiSelect, UiTag, UiToggle } from "@delebash/ui";
import { NearestQuery } from "just-house-paint-server/schemas/paints.js";
import { computed, onMounted, ref, watch } from "vue";
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

let timer = null;
async function search(more = false) {
  if (!brand.value) return;
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
    rows.value = more ? [...rows.value, ...page.rows] : page.rows;
    total.value = page.total;
  } catch (e) {
    reportError(e);
  } finally {
    searching.value = false;
  }
}
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

// a color read off the photo: into "An exact color", matched at once
watch(
  () => house.pickedColor,
  (p) => {
    if (!p) return;
    const got = house.takePickedColor();
    hex.value = got.hex;
    picked.value = true;
    match();
  },
  { immediate: true },
);

async function match() {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex.value)) return;
  try {
    nearest.value = await paints.nearest(hex.value, { brand: brand.value, k: 6, exterior: exterior.value });
    paints.remember(nearest.value.map((n) => n.paint));
  } catch (e) {
    reportError(e);
  }
}
</script>

<template>
  <div class="colors">
    <EmptyState
      v-if="!paints.ready.length" icon="Palette" compact :message="t('colors.none')" :action-label="t('colors.addBrand')"
      @action="router.push('/colors')"
    />
    <template v-else>
      <p class="hint">
        {{ house.selectedPart ? t("colors.forPart", { part: selectedName }) : t("colors.pickPart") }}
      </p>
      <div v-if="current" class="colors__current">
        <span class="swatch swatch--big" :style="{ background: current.hex }" />
        <span>{{ current.displayName }}</span>
        <UiButton intent="ghost" size="small" :label="t('colors.clear')" @click="house.setColor(house.selectedPart, null)" />
      </div>
      <!-- what a click on a paint sets: the new color, or the paint the part has on it now -->
      <div class="colors__target">
        <UiSegmented v-model="target" :options="targets" :aria-label="t('colors.target.label')" />
      </div>
      <p v-if="target === 'now'" class="hint">{{ t("colors.now.hint") }}</p>
      <div v-if="nowPaint" class="colors__current colors__now">
        <span class="hint">{{ t("colors.now.label") }}</span>
        <span class="swatch" :style="{ background: nowPaint.hex }" />
        <span>{{ nowPaint.displayName }}</span>
        <UiButton intent="ghost" size="small" :label="t('colors.now.clear')" @click="clearNow" />
      </div>
      <!-- the same paint as it shows on this wall: in shade, on most of it, in light (the chip at the
           photo's own light) — why the painted wall looks darker than the chip -->
      <div v-if="current && tones" class="colors__tones" :aria-label="t('colors.tones.label')">
        <span class="hint">{{ t("colors.tones.label") }}</span>
        <span v-for="level in ['shade', 'middle', 'light']" :key="level" class="colors__tone">
          <span class="swatch" :style="{ background: tones[level] }" :title="tones[level]" />
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
      <div class="colors__grid" :aria-busy="searching">
        <q-btn
          v-for="p in rows" :key="p.id" flat no-caps unelevated class="chip" :class="{ 'chip--on': chosenId === p.id }"
          :title="p.displayName" :aria-label="p.displayName" :disable="!house.selectedPart" @click="choose(p)"
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

      <h3 class="colors__h">{{ t("colors.exact.title") }}</h3>
      <p class="hint">{{ t("colors.exact.hint") }}</p>
      <q-form class="form__row" @submit="match">
        <UiField :label="t('colors.exact.hex')" layout="block" for="exact-hex">
          <UiInput id="exact-hex" v-model="hex" width="token" @update:model-value="picked = false" :placeholder="t('colors.exact.placeholder')" lazy-rules :rules="hexRule" />
        </UiField>
        <UiColorPicker v-model="hex" :aria-label="t('colors.exact.pick')" />
        <UiButton type="submit" intent="secondary" :label="t('colors.exact.match')" />
      </q-form>
      <p v-if="picked" class="hint">{{ t("colors.exact.picked") }}</p>
      <q-list v-if="nearest.length" class="colors__nearest" dense>
        <q-item v-for="n in nearest" :key="n.paint.id" clickable class="nearest" :disable="!house.selectedPart" @click="choose(n.paint)">
          <q-item-section avatar class="nearest__swatch"><span class="nearest__color" :style="{ background: n.paint.hex }" /></q-item-section>
          <q-item-section>{{ n.paint.displayName }}</q-item-section>
          <q-item-section side>
            <UiTag :intent="n.deltaE <= 2 ? 'success' : 'secondary'" :value="t('partsTab.deltaE', { n: n.deltaE.toFixed(1) })" />
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
.chip {
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: var(--fs-small);
}
.chip--on {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
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
.swatch--big {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--border);
}
</style>
