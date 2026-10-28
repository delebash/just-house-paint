<script setup>
// SPDX-License-Identifier: MIT
// The part finder (SAM 3) not installed yet: what it does, how much it downloads, what this computer lacks to run
// it (the Visual C++ runtime, its own ONNX Runtime — said before anything downloads, with Microsoft's own download
// named), and Install (a server job, its progress on this card — the kit's AiTaskStrip, whose Cancel stops the
// download). Nothing downloads until the user presses Install. (The AI photo's engine and model are the kit's: its
// "needs its engine" banner, LuEngineNeeded — the kit's engines plan; the part finder follows in round C.)
import { AiTaskStrip, fmtBytes, reportError, UiBanner, UiButton, useSurfaceTask } from "@delebash/ui";
import { computed } from "vue";
// vue-i18n's Translation (i18n-t): a link inside the words (vue-i18n.intlify.dev/guide/advanced/component) —
// through <component :is>, so the key report doesn't take its bound keypath for a key
import { Translation, useI18n } from "vue-i18n";
import { useEnginesStore } from "../stores/engines.js";

const props = defineProps({
  // "finder" (the one engine of the app's own until round C)
  kind: { type: String, required: true },
});
const emit = defineEmits(["installed"]);
const { t } = useI18n();
const engines = useEnginesStore();

const status = computed(() => engines.finder);
const size = computed(() => fmtBytes(status.value?.downloadBytes || 0));
// what this computer lacks (the server's slug and its facts): { reason, missing?, url?, need?, have? } or null
const need = computed(() => (status.value?.runtime?.ok === false ? status.value.runtime : null));
const blocked = computed(() => !!need.value);
const vcLink = computed(() => (["vc-runtime", "dll-too-old"].includes(need.value?.reason) ? need.value.url : null));
// the words for what it lacks — a key and its values (the link to Microsoft's download is its own slot)
const needWords = computed(() => {
  const n = need.value;
  if (!n) return null;
  if (n.reason === "vc-runtime") return ["engines.needs.vcRuntime", { files: (n.missing || []).join(", ") }];
  if (n.reason === "dll-too-old") return ["engines.needs.dllTooOld", {}];
  if (n.reason === "files-missing") return ["engines.finder.filesMissing", { files: (n.files || []).join(", ") }];
  return ["engines.finder.cantRun", { error: n.error || "" }];
});
// its download while it runs (the feature is literal for the family guard's check 17)
const installTask = useSurfaceTask("finder.install");

// Not enough room on the drive (the server's 507 "disk-full", with the bytes it needs and has): said
// with the kit's one byte formatter, the one the Install button's size is in — the server's own
// words give decimal GB, and "Install (8.9 GB)" beside "needs 9.9 GB" read as two units.
function noRoom(e) {
  const p = e?.problem;
  if (!/(^|\/)disk-full$/.test(p?.type || "") || !Number.isFinite(p.needBytes)) return null;
  const free = p.freeBytes > 0 ? fmtBytes(p.freeBytes) : t("engines.noRoom.nothing");
  const detail = t("engines.noRoom.detail", { need: fmtBytes(p.needBytes), free });
  return { status: e.status, requestId: e.requestId, problem: { ...p, title: t("engines.noRoom.title"), detail } };
}

async function install() {
  try {
    await engines.install(props.kind, t(`engines.${props.kind}.task`));
    emit("installed");
  } catch (e) {
    if (e?.name !== "AbortError") reportError(noRoom(e) || e);
  }
}
</script>

<template>
  <section class="card engine">
    <h2>{{ t(`engines.${kind}.title`) }}</h2>
    <p class="hint">{{ t(`engines.${kind}.${size ? "body" : "bodyNoSize"}`, { size }) }}</p>
    <UiBanner v-if="needWords" intent="danger" class="engine__note">
      <component :is="Translation" :keypath="needWords[0]" tag="span" scope="global">
        <template v-for="(value, name) in needWords[1]" #[name] :key="name">{{ value }}</template>
        <template v-if="vcLink" #link>
          <a :href="vcLink" target="_blank" rel="noopener">{{ t("engines.needs.vcRuntimeLink") }}</a>
        </template>
      </component>
    </UiBanner>
    <!-- focusable while off: Find the parts again brings the keyboard here, installing or not -->
    <UiButton
      intent="primary" focusable-when-disabled :disabled="engines.installing[kind] || !!installTask || !status || blocked"
      :label="engines.installing[kind] ? t('engines.installing') : size ? t('engines.install', { size }) : t('engines.installPlain')" @click="install"
    />
    <AiTaskStrip :task="installTask" />
  </section>
</template>

<style scoped>
.engine__note {
  margin-bottom: var(--sp-3);
}
</style>
