<script setup>
// SPDX-License-Identifier: MIT
// The AI photo (PRD F8, an option button beside the instant preview): either the engine to install
// first (EngineInstallCard), or an AI photo — the image the server made and kept, how close its
// paint is to the chips (ΔE2000 after the lock), how long it took, and Save image. It is a picture
// the AI drew: the instant preview stays the accurate one, and the dialog says so.
import { AppModal, reportError, requestBlob, saveBlob, serverUrl, UiButton } from "@delebash/ui";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import EngineInstallCard from "./EngineInstallCard.vue";

const props = defineProps({
  // the kept render ({ id, deltaE, seconds, … }), or null to offer the install
  render: { type: Object, default: null },
  houseName: { type: String, default: "" },
});
const emit = defineEmits(["close", "installed"]);
const { t } = useI18n();
const modal = ref(null);
const saving = ref(false);

const src = computed(() => (props.render ? serverUrl(`/v1/renders/${encodeURIComponent(props.render.id)}/image`) : ""));

async function save() {
  saving.value = true;
  try {
    const blob = await requestBlob(`/v1/renders/${encodeURIComponent(props.render.id)}/image`);
    await saveBlob(blob, `${props.houseName || t("aiPhoto.fallbackName")} — ${t("aiPhoto.suffix")}.png`, { title: t("aiPhoto.save"), filterName: "PNG", filterExt: "png" });
  } catch (e) {
    reportError(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal ref="modal" :title="t('aiPhoto.title')" max-width="1100px" @close="emit('close')">
    <EngineInstallCard v-if="!render" kind="aiphoto" @installed="emit('installed')" />
    <template v-else>
      <p class="hint">{{ t("aiPhoto.note") }}</p>
      <img class="aiphoto__img" :src="src" :alt="t('aiPhoto.alt', { name: houseName })" />
      <p class="muted">
        <template v-if="render.deltaE != null">{{ t("aiPhoto.deltaE", { n: render.deltaE.toFixed(1) }) }} · </template>
        {{ t("aiPhoto.seconds", { n: Math.round(render.seconds || 0) }) }}
      </p>
      <div class="form__actions">
        <UiButton intent="ghost" :label="t('kit.common.close')" @click="modal?.close()" />
        <UiButton intent="primary" :disabled="saving" :label="t('aiPhoto.save')" @click="save" />
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.aiphoto__img {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  margin: 0 auto var(--sp-2);
  border-radius: 6px;
}
</style>
