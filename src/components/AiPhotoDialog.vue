<script setup>
// SPDX-License-Identifier: MIT
// The AI photo (PRD F8, an option button beside the instant preview): either what it needs first — the kit's
// "needs its engine" banner (LuEngineNeeded: the engine, then the model, each with its bar), or an AI photo — the image the server made and kept, how close its
// paint is to the chips (ΔE2000 after the lock), how long it took — and, when other programs held
// the graphics card while it drew (the server's `sharedGpu`), which ones: they make it slower
// (RESEARCH §12) — and Save image. It is a picture the AI drew: the instant preview stays the
// accurate one, and the dialog says so.
import { safeTitle } from "@delebash/core/platform/filename";
import { AppModal, fmtBytes, isolate, LuEngineNeeded, reportError, requestBlob, saveBlob, UiButton, useServerImage } from "@delebash/ui";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  // the kept render ({ id, deltaE, seconds, … }), or null to offer what it needs first
  render: { type: Object, default: null },
  houseName: { type: String, default: "" },
});
const emit = defineEmits(["close", "installed"]);
const { t } = useI18n();
const modal = ref(null);
const saving = ref(false);

// the programs named under the AI photo: the biggest three, then how many more
const sharedPrograms = computed(() => {
  const s = props.render?.sharedGpu;
  if (!s) return "";
  return [...s.programs, ...(s.more ? [t("aiPhoto.sharedGpuMore", { n: s.more })] : [])].join(", ");
});

// through the kit's transport (the access token, the phone's in-app server), as an object URL
const { src } = useServerImage(() => (props.render ? `/v1/renders/${encodeURIComponent(props.render.id)}/image` : ""));

async function save() {
  saving.value = true;
  try {
    const blob = await requestBlob(`/v1/renders/${encodeURIComponent(props.render.id)}/image`);
    // the house's name made safe for a file's (the kit's safeTitle — what Windows can't hold goes)
    await saveBlob(blob, `${safeTitle(props.houseName, t("aiPhoto.fallbackName"))} — ${t("aiPhoto.suffix")}.png`, { title: t("aiPhoto.save"), filterName: "PNG", filterExt: "png" });
  } catch (e) {
    reportError(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <!-- As wide as what it holds: the banner at a prose width — an 880 px dialog held 512 px of the old install card's
       content (the seventeenth review); the AI photo itself, the room a big picture needs. -->
  <AppModal ref="modal" :title="t('aiPhoto.title')" :max-width="render ? '1100px' : '38em'" @close="emit('close')">
    <LuEngineNeeded v-if="!render" feature="aiphoto.render" :label="t('aiPhoto.featureName')" @ready="emit('installed')" />
    <template v-else>
      <p class="hint">{{ t("aiPhoto.note") }}</p>
      <img v-if="src" class="aiphoto__img" :src="src" :alt="t('aiPhoto.alt', { name: isolate(houseName) })" />
      <p class="muted">
        <template v-if="render.deltaE != null">{{ t("aiPhoto.deltaE", { n: render.deltaE.toFixed(1) }) }} · </template>
        {{ t("aiPhoto.seconds", { n: Math.round(render.seconds || 0) }) }}
      </p>
      <p v-if="render.sharedGpu" class="muted aiphoto__shared">
        {{ t("aiPhoto.sharedGpu", { size: fmtBytes(render.sharedGpu.mb * 1024 * 1024), programs: sharedPrograms }) }}
      </p>
      <div class="form__actions">
        <UiButton intent="ghost" :label="t('kit.common.close')" @click="modal?.close()" />
        <UiButton intent="primary" :disabled="saving" :label="t('aiPhoto.save')" @click="save" />
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.aiphoto__shared {
  max-width: 60ch;
}
.aiphoto__img {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  margin: 0 auto var(--sp-2);
  border-radius: 6px;
}
</style>
