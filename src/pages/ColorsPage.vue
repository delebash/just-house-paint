<script setup>
// SPDX-License-Identifier: MIT
// Paint colors (PRD F4) — the brands' real paints on this computer. The app ships no brand data:
// a brand's colors come from its public list, loaded when the user asks (a server job on the task
// strip), or from the palette file the user downloaded from the brand (ASE, ACO, CSV, Excel —
// imported here). The list is the kit's UiTable (QTable); the states are §17's (loading, failed with
// Retry). Removing a brand's colors asks first; designs that use them keep their ids.
import { confirmDialog, errorMessage, PaneHeader, pageFlow, relativeTime, reportError, UiBanner, UiButton, UiTable, UiTag } from "@delebash/ui";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { usePaintsStore } from "../stores/paints.js";

const { t } = useI18n();
const paints = usePaintsStore();

const loadFailed = ref(null);
const busy = ref({});
const picker = ref(null);
const importFor = ref(null);

async function load() {
  loadFailed.value = null;
  try {
    await paints.loadBrands();
  } catch (e) {
    loadFailed.value = e;
  }
}
onMounted(load);

const failedReason = computed(() => {
  if (!loadFailed.value) return "";
  const { title, detail } = errorMessage(loadFailed.value);
  return [title, detail].filter(Boolean).join(" — ");
});

const columns = computed(() => [
  { id: "label", header: t("paintColors.columns.brand"), accessorKey: "label" },
  { id: "paintCount", header: t("paintColors.columns.colors"), accessorKey: "paintCount" },
  { id: "source", header: t("paintColors.columns.from"), accessorKey: "source" },
  { id: "actions", header: "" },
]);

const mark = (key, on) => {
  busy.value = { ...busy.value, [key]: on };
};

async function loadFeed(brand) {
  mark(brand.key, true);
  try {
    await paints.loadFeed(brand.key, t("paintColors.loadTask", { brand: brand.label }));
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  } finally {
    mark(brand.key, false);
  }
}

function pickFile(brand) {
  importFor.value = brand;
  picker.value?.pickFiles();
}

async function onFile(file) {
  const brand = importFor.value;
  if (!file || !brand) return;
  mark(brand.key, true);
  try {
    await paints.importFile(brand.key, file);
  } catch (e) {
    reportError(e);
  } finally {
    mark(brand.key, false);
    importFor.value = null;
  }
}

async function clear(brand) {
  const yes = await confirmDialog({
    title: t("paintColors.remove.title", { brand: brand.label }),
    message: t("paintColors.remove.message", { brand: brand.label, n: brand.paintCount }),
    confirmLabel: t("paintColors.remove.confirm"),
    danger: true,
  });
  if (!yes) return;
  try {
    await paints.clearBrand(brand.key);
  } catch (e) {
    reportError(e);
  }
}
</script>

<template>
  <q-page :style-fn="pageFlow" class="page page--content">
    <PaneHeader :eyebrow="t('app.name')" :title="t('paintColors.title')" help-key="paint-colors" />
    <p class="page__lede">{{ t("paintColors.lede") }}</p>
    <q-file ref="picker" class="houses__picker" :model-value="null" accept=".ase,.aco,.csv,.xlsx" :aria-label="t('paintColors.import')" @update:model-value="onFile" />

    <UiBanner v-if="loadFailed" class="page__banner">
      {{ t("paintColors.loadFailed", { reason: failedReason }) }}
      <template #action>
        <UiButton intent="secondary" size="small" :label="t('kit.common.retry')" @click="load" />
      </template>
    </UiBanner>

    <div v-else class="paint-colors">
      <UiTable v-if="paints.brandsLoaded" :data="paints.brands" :columns="columns" data-key="key">
        <template #label="{ row }">
          <strong>{{ row.label }}</strong>
          <div v-if="row.lastError" class="paint-colors__error">{{ t("paintColors.lastError", { error: row.lastError }) }}</div>
        </template>
        <template #paintCount="{ row }">
          <span v-if="row.paintCount">{{ row.paintCount.toLocaleString() }}</span>
          <span v-else class="muted">{{ t("paintColors.none") }}</span>
        </template>
        <template #source="{ row }">
          <template v-if="row.paintCount">
            <UiTag intent="ghost" :value="row.source === 'feed' ? t('paintColors.fromFeed') : t('paintColors.fromFile')" />
            <span v-if="row.loadedAt" class="muted"> {{ relativeTime(row.loadedAt) }}</span>
          </template>
        </template>
        <template #actions="{ row }">
          <span class="paint-colors__actions">
            <UiButton
              v-if="row.feed" intent="secondary" size="small" :disabled="busy[row.key]"
              :label="row.paintCount ? t('paintColors.reload') : t('paintColors.load')" @click="loadFeed(row)"
            />
            <UiButton intent="ghost" size="small" :disabled="busy[row.key]" :label="t('paintColors.import')" @click="pickFile(row)" />
            <UiButton v-if="row.paintCount" intent="ghost" size="small" :disabled="busy[row.key]" :label="t('paintColors.remove.action')" @click="clear(row)" />
          </span>
        </template>
      </UiTable>
      <q-inner-loading :showing="!paints.brandsLoaded" :label="t('kit.common.loading')" />
      <p class="hint paint-colors__note">{{ t("paintColors.note") }}</p>
    </div>
  </q-page>
</template>

<style scoped>
.paint-colors {
  position: relative;
  min-height: 160px;
}
.paint-colors__actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
}
.paint-colors__error {
  color: var(--danger);
  font-size: var(--fs-small);
}
.paint-colors__note {
  margin-top: var(--sp-3);
  max-width: var(--w-prose);
}
</style>
