<script setup>
// SPDX-License-Identifier: MIT
// One local engine not installed yet — the part finder (SAM 3) or the AI photo (stable-diffusion.cpp
// with FLUX.2 [klein]): what it does, how much it downloads, whether this computer runs it slowly,
// and Install (a server job on the task strip; its Cancel stops the download). Nothing downloads
// until the user presses Install.
import { fmtBytes, reportError, UiBanner, UiButton } from "@delebash/ui";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useEnginesStore } from "../stores/engines.js";

const props = defineProps({
  // "finder" | "aiphoto"
  kind: { type: String, required: true },
});
const emit = defineEmits(["installed"]);
const { t } = useI18n();
const engines = useEnginesStore();

const status = computed(() => (props.kind === "finder" ? engines.finder : engines.aiphoto));
const size = computed(() => fmtBytes(status.value?.downloadBytes || 0));
const slow = computed(() => props.kind === "aiphoto" && status.value?.slow);

async function install() {
  try {
    await engines.install(props.kind, t(`engines.${props.kind}.task`));
    emit("installed");
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  }
}
</script>

<template>
  <section class="card engine">
    <h2>{{ t(`engines.${kind}.title`) }}</h2>
    <p class="hint">{{ t(`engines.${kind}.body`, { size }) }}</p>
    <UiBanner v-if="slow" intent="danger" class="engine__slow">{{ t("engines.aiphoto.slow") }}</UiBanner>
    <UiButton
      intent="primary" :disabled="engines.installing[kind] || !status"
      :label="engines.installing[kind] ? t('engines.installing') : t('engines.install', { size })" @click="install"
    />
  </section>
</template>

<style scoped>
.engine__slow {
  margin-bottom: var(--sp-3);
}
</style>
