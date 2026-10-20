<script setup>
// SPDX-License-Identifier: MIT
// Paint colors (PRD F4) — the brands' real paints on this computer. The app ships no brand data:
// a brand's colors come from its public list, loaded when the user asks (a server job on the task
// strip), or from the palette file the user downloaded from the brand (ASE, ACO, CSV, Excel —
// imported here). The list is the kit's UiTable (QTable); the states are §17's (loading, failed with
// Retry). Removing a brand's colors asks first; designs that use them keep their ids.
import {
  AiTaskStrips,
  confirmDialog,
  errorMessage,
  Icon,
  isolate,
  pageFlow,
  PaneHeader,
  pushToast,
  relativeTime,
  reportError,
  UiBanner,
  UiButton,
  UiMenu,
  UiMenuItem,
  UiTable,
  UiTag,
  UiToggle,
  useAiTasksStore,
} from "@delebash/ui";
import { computed, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { otherWindows } from "../services/otherWindows.js";
import { usePaintsStore } from "../stores/paints.js";
import { useSettingsStore } from "../stores/settings.js";

const { t, n, locale } = useI18n();
const paints = usePaintsStore();
// each brand's name an id, its Load automatically switch's description
const brandIds = useId();
const settings = useSettingsStore();

const loadFailed = ref(null);
const busy = ref({});
const picker = ref(null);
const importFor = ref(null);

async function load() {
  loadFailed.value = null;
  try {
    await Promise.all([paints.loadBrands(), settings.load()]);
  } catch (e) {
    loadFailed.value = e;
  }
}
onMounted(load);
// a brand loaded, imported or removed in another window (services/otherWindows.js)
watch(
  () => otherWindows.changes,
  () => paints.refreshBrands().catch(() => {}),
);

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

// the brands' loads above the table — every one, started here or at start-up (app-structure §8;
// <AiTaskStrips> below), a failure lingering until dismissed — and a row waits while its brand loads
const tasks = useAiTasksStore();
const loadingBrand = (key) => tasks.runningTasks.some((task) => task.feature === "paints.load" && task.meta?.brand === key);
const waits = (key) => !!busy.value[key] || loadingBrand(key);

// "Load automatically" per brand (the setting paints.autoLoad; a brand missing from it counts as on)
const autoLoad = computed(() => settings.values["paints.autoLoad"] || {});
async function setAutoLoad(brand, on) {
  try {
    await settings.save({ "paints.autoLoad": { ...autoLoad.value, [brand.key]: on } });
  } catch (e) {
    reportError(e);
    return;
  }
  // turned on with no colors yet: load them now
  if (on && !brand.paintCount && !waits(brand.key)) await loadFeed(brand);
}

// "“Navy trim” (Main street)", the first three, then "2 more"
function designList(designs) {
  const names = designs.map((d) => t("paintColors.designName", { design: isolate(d.design), house: isolate(d.house) }));
  const shown = names.length > 3 ? [...names.slice(0, 3), t("paintColors.more", { n: names.length - 3 })] : names;
  return new Intl.ListFormat(locale.value, { type: "conjunction" }).format(shown);
}

// a brand's new colors without some a design uses: say which designs (their parts show no color now)
function tellLost(brand, lost) {
  if (!lost?.length) return;
  pushToast({ kind: "warning", title: t("paintColors.lost.title"), description: t("paintColors.lost.message", { designs: designList(lost), brand: brand.label }) });
}

async function loadFeed(brand) {
  mark(brand.key, true);
  try {
    tellLost(brand, (await paints.loadFeed(brand.key, t("paintColors.loadTask", { brand: brand.label })))?.lost);
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
    tellLost(brand, (await paints.importFile(brand.key, file))?.lost);
  } catch (e) {
    reportError(e);
  } finally {
    mark(brand.key, false);
    importFor.value = null;
  }
}

async function clear(brand) {
  // the designs that use its colors are named first (a failed look-up still lets it go ahead)
  const uses = await paints.designsUsing(brand.key).catch(() => []);
  const yes = await confirmDialog({
    title: t("paintColors.remove.title", { brand: brand.label }),
    message: uses.length
      ? t("paintColors.remove.messageUsed", { brand: brand.label, n: n(brand.paintCount), designs: designList(uses) })
      : t("paintColors.remove.message", { brand: brand.label, n: n(brand.paintCount) }),
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
      <AiTaskStrips :features="['paints.load']" />
      <UiTable v-if="paints.brandsLoaded" :data="paints.brands" :columns="columns" data-key="key">
        <!-- A row on one line at 960 px (the visual review, 2026-10-20): Load automatically is under the
             brand's name, with its words (a column of its own was ~140 px for a 38 px switch), and the
             row's other actions are in its ⋯ menu (the kit's UiMenu, the row-actions menu), the main one
             beside it -->
        <template #label="{ row }">
          <strong :id="`${brandIds}-${row.key}`" class="paint-colors__nowrap">{{ row.label }}</strong>
          <div v-if="row.lastError" class="paint-colors__error">{{ t("paintColors.lastError", { error: row.lastError }) }}</div>
          <label v-if="row.feed" class="paint-colors__auto">
            <!-- named by its own words (WCAG 2.5.3, label in name), the brand its description -->
            <UiToggle
              :model-value="autoLoad[row.key] !== false" :aria-label="t('paintColors.columns.auto')"
              :aria-describedby="`${brandIds}-${row.key}`" @update:model-value="(on) => setAutoLoad(row, on)"
            />
            <span class="muted">{{ t("paintColors.columns.auto") }}</span>
          </label>
          <div v-else class="muted paint-colors__auto">{{ t("paintColors.fileOnly") }}</div>
        </template>
        <template #paintCount="{ row }">
          <span v-if="row.paintCount" class="paint-colors__nowrap">{{ n(row.paintCount) }}</span>
          <span v-else class="muted paint-colors__nowrap">{{ t("paintColors.none") }}</span>
        </template>
        <template #source="{ row }">
          <span v-if="row.paintCount" class="paint-colors__nowrap">
            <UiTag intent="ghost" :value="row.source === 'feed' ? t('paintColors.fromFeed') : t('paintColors.fromFile')" />
            <span v-if="row.loadedAt" class="muted"> {{ relativeTime(row.loadedAt) }}</span>
          </span>
        </template>
        <template #actions="{ row }">
          <span class="paint-colors__actions">
            <UiButton
              v-if="row.feed" intent="secondary" size="small" :disabled="waits(row.key)"
              :label="row.paintCount ? t('paintColors.reload') : t('paintColors.load')" @click="loadFeed(row)"
            />
            <UiButton v-else intent="secondary" size="small" :disabled="waits(row.key)" :label="t('paintColors.import')" @click="pickFile(row)" />
            <UiMenu
              v-if="row.feed || row.paintCount" :label="t('paintColors.moreActions', { brand: row.label })" align="end"
              trigger-class="ui-btn ui-btn--ghost ui-btn--small paint-colors__more" :disabled="waits(row.key)"
            >
              <template #trigger><Icon name="ChevDown" :size="14" /></template>
              <UiMenuItem v-if="row.feed" @select="pickFile(row)">{{ t("paintColors.import") }}</UiMenuItem>
              <UiMenuItem v-if="row.paintCount" @select="clear(row)">{{ t("paintColors.remove.action") }}</UiMenuItem>
            </UiMenu>
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
/* the row's buttons at the cell's right edge: its ⌄ in one column whatever the main button says ("Load
   again", "Load the colors" — the screens review, 2026-10-20) */
.paint-colors__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--sp-1);
  white-space: nowrap;
}
.paint-colors__nowrap {
  white-space: nowrap;
}
.paint-colors__auto {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: var(--sp-1);
  font-size: var(--fs-small);
  white-space: nowrap;
  cursor: pointer;
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
