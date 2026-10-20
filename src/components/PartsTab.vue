<script setup>
// SPDX-License-Identifier: MIT
// The house page's Parts tab (PRD F3): the parts the finder outlined — the ones to paint first,
// then the ones that stay (roof, stone, windows) — each with its paint, how much of the house it
// covers and, once painted, how close the screen's paint is to the chip (ΔE2000, measured on the
// painted pixels). A click selects the part the tools change; a part the finder missed is added
// here and drawn with the brush or a box.
import { Icon, reportError, UiButton, UiSelect, UiTag } from "@delebash/ui";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { partName } from "../services/partNames.js";
import { useHouseStore } from "../stores/house.js";
import { usePaintsStore } from "../stores/paints.js";
import { useSettingsStore } from "../stores/settings.js";

defineProps({
  // { part: ΔE2000 | null } — the painter's last measure
  deltaE: { type: Object, default: () => ({}) },
  // { part: #rrggbb } — each part's color as photographed (the median inside its outline)
  photographed: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["find-color"]);

const { t, te } = useI18n();
const house = useHouseStore();
const paints = usePaintsStore();
const settings = useSettingsStore();

const total = computed(() => house.parts.reduce((n, p) => n + (p.area || 0), 0) || 1);
// a part's paint by name — and a color its brand no longer has (a new list, or the brand removed) says so
function paintLabel(key) {
  const id = house.colors[key];
  if (paints.byId[id]) return paints.byId[id].displayName;
  if (id && paints.missing[id]) return t("partsTab.notLoaded", paints.idParts(id));
  return t("partsTab.unpainted");
}
// a part's share of the house: a part just added and not drawn yet is empty, a sliver is "<1%"
const share = (p) => {
  if (!p.area) return t("partsTab.empty");
  const n = (100 * p.area) / total.value;
  return n < 1 ? t("partsTab.sliver") : t("partsTab.share", { n: Math.round(n) });
};
// the part's paint, when it has one this computer has
const paintOf = (key) => paints.byId[house.colors[key]] || null;
const toPaint = computed(() => house.parts.filter((p) => p.paintable));
const staying = computed(() => house.parts.filter((p) => !p.paintable));
const nameOf = (key) => partName(key, { t, te });

// a part the finder's recipe knows that this house doesn't have yet
const adding = ref(null);
const missing = computed(() => {
  const have = new Set(house.parts.map((p) => p.key));
  return (settings.values["finder.parts"] || []).filter((r) => r.paintable && !have.has(r.key)).map((r) => ({ value: r.key, label: nameOf(r.key) }));
});
async function addPart() {
  if (!adding.value) return;
  try {
    await house.addPart(adding.value, true);
    adding.value = null;
  } catch (e) {
    reportError(e);
  }
}
</script>

<template>
  <div class="parts">
    <p class="hint">{{ t("partsTab.hint") }}</p>
    <h3 class="parts__group">{{ t("partsTab.toPaint") }}</h3>
    <q-list class="parts__list" dense>
      <!-- the row isn't a button (its own buttons would be inside one): its main action is — selecting
           the part, pressed while selected — stretched over the row (app.scss .row-action), the
           as-photographed swatch beside it -->
      <q-item v-for="p in toPaint" :key="p.key" class="parts__row" :class="{ 'parts__row--on': house.selectedPart === p.key }">
        <q-item-section avatar class="parts__swatch">
          <!-- no color: the "none" swatch, with its words — an empty box read as an unticked checkbox -->
          <span
            v-if="paintOf(p.key)" class="swatch" :style="{ background: paintOf(p.key).hex }" aria-hidden="true"
          />
          <span v-else class="swatch swatch--none" role="img" :title="t('partsTab.unpainted')" :aria-label="t('partsTab.unpainted')" />
        </q-item-section>
        <q-item-section class="parts__main">
          <q-btn
            flat no-caps unelevated align="left" class="row-action parts__pick" :aria-pressed="house.selectedPart === p.key ? 'true' : 'false'"
            @click="house.selectedPart = p.key"
          >
            <span class="row-action__body">
              <q-item-label class="parts__name">{{ nameOf(p.key) }}</q-item-label>
              <q-item-label caption class="parts__paint">{{ paintLabel(p.key) }}</q-item-label>
            </span>
          </q-btn>
          <!-- the part's facts on a line of their own under its paint, so the paint's name has the row's
               width (beside it they took ~190 px of a 300–380 px panel — the visual review, 2026-10-20) -->
          <span class="row-side parts__facts">
            <q-btn
              v-if="photographed[p.key]" flat dense unelevated class="parts__now" :style="{ background: photographed[p.key] }"
              :title="t('partsTab.photographed', { hex: photographed[p.key] })" :aria-label="t('partsTab.photographed', { hex: photographed[p.key] })"
              @click="emit('find-color', photographed[p.key])"
            />
            <span class="muted">{{ share(p) }}</span>
            <!-- green is a close match: the words say it too, for a screen reader (the colour alone doesn't) -->
            <UiTag v-if="deltaE[p.key] != null" :intent="deltaE[p.key] <= 2 ? 'success' : 'secondary'" :title="t('partsTab.deltaEHint')">
              {{ t("partsTab.deltaE", { n: deltaE[p.key].toFixed(1) }) }}<span class="visually-hidden"> {{ deltaE[p.key] <= 2 ? t("partsTab.deltaEClose") : t("partsTab.deltaEFar") }}</span>
            </UiTag>
            <UiTag v-if="p.source !== 'auto'" intent="ghost" :value="t('partsTab.edited')" />
          </span>
        </q-item-section>
      </q-item>
    </q-list>
    <h3 v-if="staying.length" class="parts__group">{{ t("partsTab.staying") }}</h3>
    <q-list v-if="staying.length" class="parts__list" dense>
      <q-item v-for="p in staying" :key="p.key" class="parts__row">
        <q-item-section avatar class="parts__swatch"><Icon name="Check" :size="14" class="muted" /></q-item-section>
        <q-item-section class="parts__name">{{ nameOf(p.key) }}</q-item-section>
        <q-item-section side class="muted">{{ share(p) }}</q-item-section>
      </q-item>
    </q-list>
    <div v-if="missing.length" class="parts__add">
      <UiSelect v-model="adding" :options="missing" width="name" :placeholder="t('partsTab.addPlaceholder')" :aria-label="t('partsTab.add')" />
      <UiButton intent="secondary" :disabled="!adding" :label="t('partsTab.add')" @click="addPart" />
    </div>
  </div>
</template>

<style scoped>
.parts__group {
  font-size: var(--fs-small);
  font-weight: 600;
  margin: var(--sp-3) 0 var(--sp-1);
}
.parts__row {
  border: 1px solid transparent;
  border-radius: 6px;
}
.parts__row--on {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.parts__swatch {
  min-width: 0;
  padding-right: var(--sp-2);
}
.parts__name {
  font-weight: 600;
}
/* the paint's name wraps under the part's, never cut */
.parts__paint {
  overflow-wrap: anywhere;
}
.parts__facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  margin-top: 2px;
}
/* 24 × 24: the smallest target WCAG 2.2 allows (2.5.8) */
.parts__now {
  min-width: 24px;
  min-height: 24px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
}
/* the button drops under the list in a narrow panel: on one line they held the side panel at 333 px,
   past its 300 px floor (measured) */
.parts__add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
}
</style>
