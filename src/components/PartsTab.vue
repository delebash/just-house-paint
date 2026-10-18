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
const share = (p) => Math.max(1, Math.round((100 * (p.area || 0)) / total.value));
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
      <q-item
        v-for="p in toPaint" :key="p.key" clickable class="parts__row" :active="house.selectedPart === p.key"
        active-class="parts__row--on" @click="house.selectedPart = p.key"
      >
        <q-item-section avatar class="parts__swatch">
          <span class="swatch" :style="{ background: paints.byId[house.colors[p.key]]?.hex || 'transparent' }" />
        </q-item-section>
        <q-item-section>
          <q-item-label class="parts__name">{{ nameOf(p.key) }}</q-item-label>
          <q-item-label caption class="parts__paint">{{ paints.byId[house.colors[p.key]]?.displayName || t("partsTab.unpainted") }}</q-item-label>
        </q-item-section>
        <q-item-section side class="parts__side">
          <q-btn
            v-if="photographed[p.key]" flat dense unelevated class="parts__now" :style="{ background: photographed[p.key] }"
            :title="t('partsTab.photographed', { hex: photographed[p.key] })" :aria-label="t('partsTab.photographed', { hex: photographed[p.key] })"
            @click.stop="emit('find-color', photographed[p.key])"
          />
          <span class="muted">{{ t("partsTab.share", { n: share(p) }) }}</span>
          <UiTag
            v-if="deltaE[p.key] != null" :intent="deltaE[p.key] <= 2 ? 'success' : 'secondary'"
            :title="t('partsTab.deltaEHint')" :value="t('partsTab.deltaE', { n: deltaE[p.key].toFixed(1) })"
          />
          <UiTag v-if="p.source !== 'auto'" intent="ghost" :value="t('partsTab.edited')" />
        </q-item-section>
      </q-item>
    </q-list>
    <h3 v-if="staying.length" class="parts__group">{{ t("partsTab.staying") }}</h3>
    <q-list v-if="staying.length" class="parts__list" dense>
      <q-item v-for="p in staying" :key="p.key" class="parts__row">
        <q-item-section avatar class="parts__swatch"><Icon name="Check" :size="14" class="muted" /></q-item-section>
        <q-item-section class="parts__name">{{ nameOf(p.key) }}</q-item-section>
        <q-item-section side class="muted">{{ t("partsTab.share", { n: share(p) }) }}</q-item-section>
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
  color: inherit;
}
.parts__swatch {
  min-width: 0;
  padding-right: var(--sp-2);
}
.parts__name {
  font-weight: 600;
}
.parts__side {
  flex-direction: row;
  align-items: center;
  gap: var(--sp-2);
}
.parts__now {
  min-width: 18px;
  min-height: 18px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
}
.parts__add {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
}
.swatch {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid var(--border);
}
</style>
