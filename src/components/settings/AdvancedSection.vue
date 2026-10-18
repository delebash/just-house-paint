<script setup>
// SPDX-License-Identifier: MIT
// Settings → Advanced — the app's structured settings, each as the JSON the server keeps
// (/v1/settings, a schema per key — family rule 1): what the part finder looks for and in which
// order a pixel two parts claim is given, which parts each scheme role paints, the harmony rules,
// and the AI photo's prompts and compositing. Each is saved on its own; the server's schema is the
// check (a 422 lands under the field, worded from its `type` and `ctx`), and text that isn't JSON is
// refused before it is sent.
import { fieldErrors, reportError, UiButton, UiField, UiTextarea } from "@delebash/ui";
import { onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "../../stores/settings.js";

const { t } = useI18n();
const settings = useSettingsStore();

const KEYS = ["finder.parts", "finder.priority", "schemes.roleParts", "schemes.harmony", "aiphoto.templates", "aiphoto.compose"];
const idOf = (key) => `advanced-${key.replace(".", "-")}`;
const asText = (v) => JSON.stringify(v ?? null, null, 2);

const draft = reactive(Object.fromEntries(KEYS.map((k) => [k, ""])));
const errors = ref({});
const saving = ref({});
const loaded = ref(false);

onMounted(async () => {
  try {
    await settings.load();
    for (const k of KEYS) draft[k] = asText(settings.values[k]);
    loaded.value = true;
  } catch (e) {
    reportError(e);
  }
});

async function save(key) {
  let value;
  try {
    value = JSON.parse(draft[key]);
  } catch (e) {
    errors.value = { ...errors.value, [key]: t("settings.advanced.notJson", { reason: e.message }) };
    return;
  }
  saving.value = { ...saving.value, [key]: true };
  errors.value = { ...errors.value, [key]: undefined };
  try {
    await settings.save({ [key]: value });
    draft[key] = asText(settings.values[key]);
  } catch (e) {
    const message = fieldErrors(e)[key];
    if (message) errors.value = { ...errors.value, [key]: message };
    else reportError(e);
  } finally {
    saving.value = { ...saving.value, [key]: false };
  }
}
</script>

<template>
  <section class="card">
    <h2>{{ t("settings.advanced.title") }}</h2>
    <p class="hint">{{ t("settings.advanced.hint") }}</p>
    <div class="form">
      <UiField v-for="key in KEYS" :key="key" :label="t(`settings.advanced.fields.${key}`)" layout="block" :for="idOf(key)">
        <p class="hint">{{ t(`settings.advanced.hints.${key}`) }}</p>
        <UiTextarea
          :id="idOf(key)" v-model="draft[key]" width="edit" :rows="8" class="mono" :disabled="!loaded"
          :error="!!errors[key]" :error-message="errors[key]" @update:model-value="errors = { ...errors, [key]: undefined }"
        />
        <div class="form__actions">
          <UiButton
            intent="secondary" :disabled="!loaded || saving[key] || draft[key] === asText(settings.values[key])"
            :label="saving[key] ? t('kit.common.saving') : t('kit.common.save')" @click="save(key)"
          />
        </div>
      </UiField>
    </div>
  </section>
</template>
