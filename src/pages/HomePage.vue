<script setup>
// SPDX-License-Identifier: MIT
// Your houses — the app's home (PRD F1): a card per house photo, "Add a photo", and the states every
// loading screen has (app-structure §17): loading (q-inner-loading), empty (the kit's EmptyState
// with the one action that fills it), failed (the kit's UiBanner with the reason and Retry). The
// photo is picked with Quasar's QFile (hidden; the button opens it — Quasar's documented use) and
// sent to the server, which keeps it (family rule 2). The first house added is this app's moment
// for the once-ever AI offer (§11). A rename is the §15 form (NameDialog over HousePatch); a delete
// asks first, naming what is lost.
import {
  confirmDialog,
  EmptyState,
  errorMessage,
  Icon,
  PaneHeader,
  pageFlow,
  relativeTime,
  reportError,
  schemaRules,
  UiBanner,
  UiButton,
  UiServerImage,
} from "@delebash/ui";
import { HousePatch } from "just-house-paint-server/schemas/houses.js";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import NameDialog from "../components/NameDialog.vue";
import { imagePath, useHousesStore } from "../stores/houses.js";
import { useUiStore } from "../stores/ui.js";

const { t } = useI18n();
const router = useRouter();
const houses = useHousesStore();
const ui = useUiStore();

const loadFailed = ref(null);
const picker = ref(null);
const adding = ref(false);
const renaming = ref(null);
const nameRule = schemaRules(HousePatch).name;

async function load() {
  loadFailed.value = null;
  try {
    await houses.load();
  } catch (e) {
    loadFailed.value = e;
  }
}
onMounted(load);

const firstLoad = computed(() => houses.loading && !houses.loaded);
const failedReason = computed(() => {
  if (!loadFailed.value) return "";
  const { title, detail } = errorMessage(loadFailed.value);
  return [title, detail].filter(Boolean).join(" — ");
});

function pick() {
  picker.value?.pickFiles();
}

async function onFile(file) {
  if (!file) return;
  adding.value = true;
  const first = houses.items.length === 0;
  try {
    const house = await houses.add(file);
    if (first) ui.maybeOfferAiSetup();
    router.push(`/house/${encodeURIComponent(house.id)}`);
  } catch (e) {
    reportError(e);
  } finally {
    adding.value = false;
    picker.value?.removeAtIndex?.(0);
  }
}

async function remove(house) {
  const yes = await confirmDialog({
    title: t("houses.delete.title"),
    message: t("houses.delete.message", { name: house.name }),
    confirmLabel: t("houses.delete.confirm"),
    danger: true,
  });
  if (!yes) return;
  try {
    await houses.remove(house.id);
  } catch (e) {
    reportError(e);
  }
}

const open = (house) => router.push(`/house/${encodeURIComponent(house.id)}`);
const thumb = (house) => imagePath(house.id, "thumb", house.updatedAt);
</script>

<template>
  <q-page :style-fn="pageFlow" class="page">
    <PaneHeader :eyebrow="t('app.name')" :title="t('houses.title')" help-key="your-houses">
      <UiButton intent="primary" :disabled="adding || !houses.loaded" :label="adding ? t('houses.adding') : t('houses.add')" @click="pick" />
    </PaneHeader>
    <q-file
      ref="picker" class="houses__picker" :model-value="null" accept="image/*"
      :aria-label="t('houses.add')" @update:model-value="onFile"
    />

    <UiBanner v-if="loadFailed" class="page__banner">
      {{ t("houses.loadFailed", { reason: failedReason }) }}
      <template #action>
        <UiButton intent="secondary" size="small" :label="t('kit.common.retry')" @click="load" />
      </template>
    </UiBanner>

    <div v-else class="houses">
      <EmptyState
        v-if="houses.loaded && !houses.items.length"
        icon="Image" :title="t('houses.empty.title')" :message="t('houses.empty.message')"
        :action-label="t('houses.add')" @action="pick"
      />
      <div v-else-if="houses.loaded" class="houses__grid">
        <q-card v-for="house in houses.items" :key="house.id" flat bordered class="houses__card">
          <UiServerImage
            :path="thumb(house)" :ratio="4 / 3" fit="cover" :alt="house.name" class="houses__open" role="link" tabindex="0"
            :aria-label="t('houses.open', { name: house.name })" @click="open(house)" @keydown.enter="open(house)"
          />
          <q-card-section class="houses__meta">
            <div class="houses__name">{{ house.name }}</div>
            <div class="muted">
              {{ t("houses.designs", { n: house.designCount }, house.designCount) }} · {{ relativeTime(house.updatedAt) }}
            </div>
          </q-card-section>
          <q-card-actions class="houses__actions">
            <UiButton intent="ghost" size="icon" :title="t('houses.rename.action', { name: house.name })" :aria-label="t('houses.rename.action', { name: house.name })" @click="renaming = house">
              <template #icon><Icon name="Pencil" :size="14" /></template>
            </UiButton>
            <UiButton intent="ghost" size="icon" :title="t('houses.delete.action', { name: house.name })" :aria-label="t('houses.delete.action', { name: house.name })" @click="remove(house)">
              <template #icon><Icon name="Trash" :size="14" /></template>
            </UiButton>
          </q-card-actions>
        </q-card>
      </div>
      <q-inner-loading :showing="firstLoad" :label="t('kit.common.loading')" />
    </div>

    <NameDialog
      v-if="renaming" :title="t('houses.rename.title')" :label="t('houses.rename.label')" :value="renaming.name"
      :rule="nameRule" :save="(name) => houses.rename(renaming.id, name)" @close="renaming = null"
    />
  </q-page>
</template>
