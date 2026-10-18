<script setup>
// SPDX-License-Identifier: MIT
// A name, asked for in a dialog — a house's new name, a design's name. The §15 form (the template's
// NoteDialog is the reference): the kit's AppModal around Quasar's QForm; the rules are the route's
// own schema field (`rule`, from schemaRules over the server package's schema); a 422 lands under
// the field (`fieldErrors(...).name`), any other failure goes through `reportError`; Save is
// disabled while it saves. `save(name)` does the request; the dialog closes when it resolves.
import { AppModal, fieldErrors, reportError, UiButton, UiField, UiInput } from "@delebash/ui";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  title: { type: String, required: true },
  label: { type: String, required: true },
  value: { type: String, default: "" },
  // the field's rules: schemaRules(Schema).name
  rule: { type: Array, default: () => [] },
  confirmLabel: { type: String, default: "" },
  save: { type: Function, required: true },
});
const emit = defineEmits(["close", "saved"]);
const { t } = useI18n();

const name = ref(props.value);
const serverError = ref("");
const saving = ref(false);
const modal = ref(null);

async function submit() {
  saving.value = true;
  serverError.value = "";
  try {
    const saved = await props.save(name.value);
    emit("saved", saved);
    modal.value?.close();
  } catch (e) {
    const message = fieldErrors(e).name;
    if (message) serverError.value = message;
    else reportError(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal ref="modal" :title="title" max-width="560px" @close="emit('close')">
    <q-form class="form" greedy @submit="submit">
      <UiField :label="label" layout="block" for="name-dialog-input">
        <UiInput
          id="name-dialog-input" v-model="name" width="name" autofocus lazy-rules
          :rules="rule" :error="!!serverError" :error-message="serverError"
          @update:model-value="serverError = ''"
        />
      </UiField>
      <div class="form__actions">
        <UiButton intent="ghost" :label="t('kit.common.cancel')" @click="modal?.close()" />
        <UiButton type="submit" intent="primary" :disabled="saving" :label="saving ? t('kit.common.saving') : confirmLabel || t('kit.common.save')" />
      </div>
    </q-form>
  </AppModal>
</template>
