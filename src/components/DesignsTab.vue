<script setup>
// SPDX-License-Identifier: MIT
// The house page's Designs tab (PRD F7): the colors on screen saved as a named design, the saved
// designs to open, rename or delete, and the house's AI photos. The colors on screen are a draft
// until saved; opening a design while the draft has changes asks first. A name is the §15 form
// (NameDialog over DesignIn's rules); a delete asks first, naming what is lost.
import { confirmDialog, Icon, relativeTime, reportError, schemaRules, UiButton, UiServerImage, UiTag } from "@delebash/ui";
import { DesignIn } from "just-house-paint-server/schemas/houses.js";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useHouseStore } from "../stores/house.js";
import NameDialog from "./NameDialog.vue";

const emit = defineEmits(["show-render"]);
const { t } = useI18n();
const house = useHouseStore();

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
  house.openDesign(design.id);
}

async function remove(design) {
  const yes = await confirmDialog({
    title: t("designs.delete.title"),
    message: t("designs.delete.message", { name: design.name }),
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
</script>

<template>
  <div class="designs">
    <p class="hint">{{ t("designs.hint") }}</p>
    <div class="designs__actions">
      <UiButton v-if="house.designId" intent="primary" :disabled="!house.dirty" :label="t('designs.save', { name: house.design?.name })" @click="save" />
      <UiButton :intent="house.designId ? 'secondary' : 'primary'" :disabled="!Object.keys(house.colors).length" :label="t('designs.saveAs')" @click="naming = {}" />
    </div>
    <p v-if="!house.designs.length" class="muted">{{ t("designs.none") }}</p>
    <q-list v-else class="designs__list" dense>
      <q-item
        v-for="d in house.designs" :key="d.id" clickable class="designs__row" :active="d.id === house.designId"
        active-class="designs__row--on" @click="open(d)"
      >
        <q-item-section>
          <q-item-label class="designs__name">{{ d.name }}</q-item-label>
          <q-item-label caption>{{ t("designs.colors", { n: Object.keys(d.colors).length }, Object.keys(d.colors).length) }} · {{ relativeTime(d.updatedAt) }}</q-item-label>
        </q-item-section>
        <q-item-section side class="designs__side" @click.stop>
          <UiTag v-if="d.id === house.designId && house.dirty" intent="secondary" :value="t('designs.changed')" />
          <UiButton intent="ghost" size="icon" :title="t('designs.rename', { name: d.name })" :aria-label="t('designs.rename', { name: d.name })" @click="naming = d">
            <template #icon><Icon name="Pencil" :size="14" /></template>
          </UiButton>
          <UiButton intent="ghost" size="icon" :title="t('designs.delete.action', { name: d.name })" :aria-label="t('designs.delete.action', { name: d.name })" @click="remove(d)">
            <template #icon><Icon name="Trash" :size="14" /></template>
          </UiButton>
        </q-item-section>
      </q-item>
    </q-list>

    <h3 class="designs__h">{{ t("designs.renders.title") }}</h3>
    <p v-if="!house.renders.length" class="muted">{{ t("designs.renders.none") }}</p>
    <q-list v-else class="designs__renders" dense>
      <q-item v-for="r in house.renders" :key="r.id" clickable class="designs__render" :aria-label="t('designs.renders.open')" @click="emit('show-render', r)">
        <q-item-section avatar class="designs__thumb">
          <UiServerImage :path="renderPath(r)" :ratio="4 / 3" fit="cover" alt="" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{ designName(r.designId) || t("designs.renders.onScreen") }}</q-item-label>
          <q-item-label caption>{{ relativeTime(r.createdAt) }}<template v-if="r.deltaE != null"> · {{ t("partsTab.deltaE", { n: r.deltaE.toFixed(1) }) }}</template></q-item-label>
        </q-item-section>
        <q-item-section side @click.stop>
          <UiButton intent="ghost" size="icon" :title="t('designs.renders.delete')" :aria-label="t('designs.renders.delete')" @click="removeRender(r)">
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
  color: inherit;
}
.designs__name {
  font-weight: 600;
}
.designs__side {
  flex-direction: row;
  align-items: center;
  gap: 2px;
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
