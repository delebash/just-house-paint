<script setup>
// SPDX-License-Identifier: MIT
// The house page's Designs tab (PRD F7): the colors on screen saved as a named design, the saved
// designs to open, rename or delete, and the house's AI photos. The colors on screen are a draft
// until saved; opening a design while the draft has changes asks first. A name is the §15 form
// (NameDialog over DesignIn's rules); a delete asks first, naming what is lost. A design saved before
// the house had some trim-group parts leaves them unpainted: opening it offers, in a banner, to paint
// them the design's trim color — one click, never unasked (the store's unpaintedTrim).
import { confirmDialog, EmptyState, Icon, isolate, relativeTime, reportError, schemaRules, UiBanner, UiButton, UiServerImage, UiTag } from "@delebash/ui";
import { DesignIn } from "just-house-paint-server/schemas/houses.js";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { partName } from "../services/partNames.js";
import { useHouseStore } from "../stores/house.js";
import { useSettingsStore } from "../stores/settings.js";
import NameDialog from "./NameDialog.vue";

const emit = defineEmits(["show-render", "color-card"]);
const { t, te, locale } = useI18n();
const house = useHouseStore();
const settings = useSettingsStore();

const nameRule = schemaRules(DesignIn).name;
// the name dialog: closed (null), a new design ({}), or the design to rename
const naming = ref(null);

async function save() {
  try {
    await house.saveDesign();
  } catch (e) {
    reportError(e);
  }
}

async function open(design) {
  if (house.dirty && Object.keys(house.colors).length) {
    const yes = await confirmDialog({ title: t("designs.discard.title"), message: t("designs.discard.message"), confirmLabel: t("designs.discard.confirm") });
    if (!yes) return;
  }
  house.openDesign(design.id, settings.values["schemes.roleParts"]);
}

// the trim offer's words: its parts' names as one list ("A and B", "A, B and C" — the locale's)
const offerCount = computed(() => house.trimOfferParts.length);
const offerMessage = computed(() => {
  const names = house.trimOfferParts.map((key) => partName(key, { t, te }));
  const parts = new Intl.ListFormat(locale.value, { type: "conjunction" }).format(names);
  return t("designs.trimOffer.message", { parts }, names.length);
});

async function remove(design) {
  const yes = await confirmDialog({
    title: t("designs.delete.title"),
    message: t("designs.delete.message", { name: isolate(design.name) }),
    confirmLabel: t("designs.delete.confirm"),
    danger: true,
  });
  if (!yes) return;
  try {
    await house.deleteDesign(design.id);
  } catch (e) {
    reportError(e);
  }
}

async function removeRender(render) {
  const yes = await confirmDialog({ title: t("designs.renders.deleteTitle"), message: t("designs.renders.deleteMessage"), confirmLabel: t("designs.renders.deleteConfirm"), danger: true });
  if (!yes) return;
  try {
    await house.deleteRender(render.id);
  } catch (e) {
    reportError(e);
  }
}

const saveName = (name) => (naming.value?.id ? house.renameDesign(naming.value.id, name) : house.saveDesignAs(name));
const renderPath = (r) => `/v1/renders/${encodeURIComponent(r.id)}/image`;
const designName = (id) => house.designs.find((d) => d.id === id)?.name;
// an AI photo's row is named by what tells it from the others: its design, when, and its ΔE
function renderLabel(r) {
  const name = designName(r.designId);
  const words = { design: name ? isolate(name) : t("designs.renders.onScreen"), when: relativeTime(r.createdAt) };
  return r.deltaE != null ? t("designs.renders.openDeltaE", { ...words, n: r.deltaE.toFixed(1) }) : t("designs.renders.open", words);
}
</script>

<template>
  <div class="designs">
    <p class="hint">{{ t("designs.hint") }}</p>
    <div class="designs__actions">
      <UiButton v-if="house.designId" intent="primary" :disabled="!house.dirty" :label="t('designs.save', { name: isolate(house.design?.name) })" @click="save" />
      <UiButton :intent="house.designId ? 'secondary' : 'primary'" :disabled="!Object.keys(house.colors).length" :label="t('designs.saveAs')" @click="naming = {}" />
      <UiButton intent="ghost" :disabled="!Object.keys(house.colors).length" :label="t('designs.colorCard')" :title="t('designs.colorCardHint')" @click="emit('color-card')" />
    </div>
    <EmptyState v-if="!house.designs.length" icon="Palette" compact :message="t('designs.none')" />
    <q-list v-else class="designs__list" dense>
      <!-- the row isn't a button (rename and delete would be inside one): opening the design is —
           stretched over the row (app.scss .row-action), the open one aria-current — its buttons beside it -->
      <q-item v-for="d in house.designs" :key="d.id" class="designs__row" :class="{ 'designs__row--on': d.id === house.designId }">
        <q-item-section>
          <q-btn
            flat no-caps unelevated align="left" class="row-action designs__open" :aria-current="d.id === house.designId ? 'true' : undefined"
            @click="open(d)"
          >
            <span class="row-action__body">
              <q-item-label class="designs__name">{{ d.name }}</q-item-label>
              <q-item-label caption>{{ t("designs.colors", { n: Object.keys(d.colors).length }, Object.keys(d.colors).length) }} · {{ relativeTime(d.updatedAt) }}</q-item-label>
            </span>
          </q-btn>
        </q-item-section>
        <q-item-section side class="row-side designs__side">
          <UiTag v-if="d.id === house.designId && house.dirty" intent="secondary" :value="t('designs.changed')" />
          <UiButton intent="ghost" size="icon" v-tooltip="t('designs.rename', { name: isolate(d.name) })" :aria-label="t('designs.rename', { name: isolate(d.name) })" @click="naming = d">
            <template #icon><Icon name="Pencil" :size="14" /></template>
          </UiButton>
          <UiButton intent="ghost" size="icon" v-tooltip="t('designs.delete.action', { name: isolate(d.name) })" :aria-label="t('designs.delete.action', { name: isolate(d.name) })" @click="remove(d)">
            <template #icon><Icon name="Trash" :size="14" /></template>
          </UiButton>
        </q-item-section>
      </q-item>
    </q-list>
    <!-- the actions under the words (QBanner's own layout): the side panel is too narrow for them inline -->
    <UiBanner v-if="offerCount" intent="info" :inline-actions="false" class="designs__offer">
      {{ offerMessage }}
      <template #action>
        <UiButton intent="ghost" size="small" :label="t('kit.common.dismiss')" @click="house.dismissTrimOffer()" />
        <UiButton intent="primary" size="small" :label="t('designs.trimOffer.paint', offerCount)" @click="house.applyTrimOffer()" />
      </template>
    </UiBanner>

    <h3 class="designs__h">{{ t("designs.renders.title") }}</h3>
    <EmptyState v-if="!house.renders.length" icon="Image" compact :message="t('designs.renders.none')" />
    <q-list v-else class="designs__renders" dense>
      <!-- as a design's row: opening the AI photo is the row's own button, Delete beside it -->
      <q-item v-for="r in house.renders" :key="r.id" class="designs__render">
        <q-item-section avatar class="designs__thumb">
          <UiServerImage :path="renderPath(r)" :ratio="4 / 3" fit="cover" alt="" />
        </q-item-section>
        <q-item-section>
          <q-btn flat no-caps unelevated align="left" class="row-action designs__view" :aria-label="renderLabel(r)" @click="emit('show-render', r)">
            <span class="row-action__body">
              <q-item-label>{{ designName(r.designId) || t("designs.renders.onScreen") }}</q-item-label>
              <q-item-label caption>{{ relativeTime(r.createdAt) }}<template v-if="r.deltaE != null"> · {{ t("partsTab.deltaE", { n: r.deltaE.toFixed(1) }) }}</template></q-item-label>
            </span>
          </q-btn>
        </q-item-section>
        <q-item-section side class="row-side">
          <UiButton intent="ghost" size="icon" v-tooltip="t('designs.renders.delete')" :aria-label="t('designs.renders.delete')" @click="removeRender(r)">
            <template #icon><Icon name="Trash" :size="14" /></template>
          </UiButton>
        </q-item-section>
      </q-item>
    </q-list>

    <NameDialog
      v-if="naming" :title="naming.id ? t('designs.renameTitle') : t('designs.saveAsTitle')" :label="t('designs.name')"
      :value="naming.name || ''" :rule="nameRule" :save="saveName" @close="naming = null"
    />
  </div>
</template>

<style scoped>
.designs__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-bottom: var(--sp-3);
}
.designs__row {
  border: 1px solid transparent;
  border-radius: 6px;
}
.designs__row--on {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.designs__name {
  font-weight: 600;
}
.designs__side {
  flex-direction: row;
  align-items: center;
  gap: 2px;
}
.designs__offer {
  margin-top: var(--sp-2);
}
.designs__h {
  font-size: var(--fs-small);
  font-weight: 600;
  margin: var(--sp-4) 0 var(--sp-1);
}
.designs__thumb {
  width: 72px;
  padding-right: var(--sp-2);
}
</style>
