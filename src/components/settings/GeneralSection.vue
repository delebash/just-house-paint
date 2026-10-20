<script setup>
// SPDX-License-Identifier: MIT
// Settings → General — the app's own settings that are numbers or switches (/v1/settings, a schema
// per key; family rule 1: a value a user might change is a seeded row, never a constant). The §15
// form: the rules are the route's own schema (`schemaRules(SettingsPatch)` from the server
// package), a 422 lands under its field (`fieldErrors`), any other failure goes through
// `reportError`, Save is disabled while it runs. The structured settings (the finder's parts, the
// scheme rules, the AI photo's prompts) are Settings → Advanced.
import { fieldErrors, reportError, schemaRules, UiButton, UiField, UiNumber, UiToggle } from "@delebash/ui";
import { SettingsPatch } from "just-house-paint-server/schemas/settings.js";
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "../../stores/settings.js";

const { t } = useI18n();
const settings = useSettingsStore();

// [card, [[key, kind, step?]]] — the words are settings.general.<card>.* and settings.general.fields.<key>
const GROUPS = [
  ["photos", [["photos.displayMax", "number"], ["photos.thumbMax", "number"], ["photos.jpegQuality", "number"], ["photos.maxMegabytes", "number"], ["photos.fullSizeMaxMegapixels", "number"]]],
  ["designs", [["designs.maxPerHouse", "number"], ["paints.maxImportMegabytes", "number"]]],
  ["finder", [["finder.useGpu", "toggle"], ["finder.idleMinutes", "number"], ["finder.houseMargin", "number", 0.01], ["finder.houseMinShare", "number", 0.05]]],
  ["aiphoto", [["aiphoto.workingPixels", "number"], ["aiphoto.sharedGpuNoteMb", "number"]]],
  ["windows", [["windows.checkSeconds", "number"]]],
];
const KEYS = GROUPS.flatMap(([, fields]) => fields.map(([key]) => key));
const idOf = (key) => `setting-${key.replace(".", "-")}`;

const rules = schemaRules(SettingsPatch);
const draft = reactive(Object.fromEntries(KEYS.map((k) => [k, null])));
const serverErrors = ref({});
const saving = ref(false);
const loaded = ref(false);

const changes = computed(() => (loaded.value ? Object.fromEntries(KEYS.filter((k) => draft[k] !== (settings.values[k] ?? null)).map((k) => [k, draft[k]])) : {}));

onMounted(async () => {
  try {
    await settings.load();
    for (const k of KEYS) draft[k] = settings.values[k] ?? null;
    loaded.value = true;
  } catch (e) {
    reportError(e);
  }
});

async function save() {
  saving.value = true;
  serverErrors.value = {};
  try {
    await settings.save(changes.value);
    for (const k of KEYS) draft[k] = settings.values[k];
  } catch (e) {
    const fields = fieldErrors(e);
    const mine = Object.fromEntries(Object.entries(fields).filter(([k]) => KEYS.includes(k)));
    serverErrors.value = mine;
    if (!Object.keys(mine).length) reportError(e);
  } finally {
    saving.value = false;
  }
}

function edited(key) {
  if (serverErrors.value[key]) serverErrors.value = { ...serverErrors.value, [key]: undefined };
}
</script>

<template>
  <q-form class="form" greedy @submit="save">
    <section v-for="[group, fields] in GROUPS" :key="group" class="card">
      <h2>{{ t(`settings.general.${group}.title`) }}</h2>
      <p class="hint">{{ t(`settings.general.${group}.hint`) }}</p>
      <div class="form__row">
        <template v-for="[key, kind, step] in fields" :key="key">
          <label v-if="kind === 'toggle'" class="toggle-row">
            <UiToggle v-model="draft[key]" :disabled="!loaded" :aria-label="t(`settings.general.fields.${key}`)" @update:model-value="edited(key)" />
            <span>{{ t(`settings.general.fields.${key}`) }}</span>
          </label>
          <UiField v-else :label="t(`settings.general.fields.${key}`)" layout="block" :for="idOf(key)">
            <UiNumber
              :id="idOf(key)" v-model="draft[key]" width="num" :step="step || 1" :disabled="!loaded" lazy-rules
              :rules="rules[key]" :error="!!serverErrors[key]" :error-message="serverErrors[key]"
              @update:model-value="edited(key)"
            />
          </UiField>
        </template>
      </div>
    </section>
    <div class="form__actions settings__save">
      <UiButton type="submit" intent="primary" :disabled="saving || !Object.keys(changes).length" :label="saving ? t('kit.common.saving') : t('kit.common.save')" />
    </div>
  </q-form>
</template>
