<script setup>
// SPDX-License-Identifier: MIT
// The house page's Schemes tab (PRD F6): ready-made color schemes — body, trim and accent — each a
// real paint of the chosen brand, applied to the house's parts in one click (which parts a role
// paints is the `schemes.roleParts` setting). Three sources:
//   - harmony: complementary, analogous, triadic, … around a base paint (the body's, by default);
//   - the brand's own coordinating colors for that paint, when its list has them;
//   - the AI (the feature `schemes.suggest`): it reads the house's current colors — the roof, the
//     stone, what stays — and the owner's mood, through the kit's withAiTask (the task strip shows
//     it; app code never owns a task, §8). Its colors are snapped to real paints by the server.
import {
  AiTaskStrip,
  EmptyState,
  post,
  reportError,
  schemaRules,
  UiButton,
  UiField,
  UiInput,
  UiSelect,
  UiTag,
  useSurfaceTask,
  withAiTask,
} from "@delebash/ui";
import { AiSchemesIn } from "just-house-paint-server/schemas/paints.js";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { schemeReasons } from "../services/schemeNotes.js";
import { useHouseStore } from "../stores/house.js";
import { usePaintsStore } from "../stores/paints.js";
import { useSettingsStore } from "../stores/settings.js";

const { t } = useI18n();
const router = useRouter();
const house = useHouseStore();
const paints = usePaintsStore();
const settings = useSettingsStore();

const ROLES = ["body", "trim", "accent"];
const rules = schemaRules(AiSchemesIn);

const brand = ref(paints.byId[house.colors.body]?.brand || paints.ready[0]?.key || null);
// the first brand's colors land while the tab is open (the first start): it is chosen then
watch(
  () => paints.ready.length,
  () => {
    if (!brand.value) brand.value = paints.byId[house.colors.body]?.brand || paints.ready[0]?.key || null;
  },
);
const brandOptions = computed(() => paints.ready.map((b) => ({ value: b.key, label: b.label })));
// the body's paint is another brand's: which one (the schemes are built in the brand chosen above)
const bodyBrand = computed(() => {
  const p = paints.byId[house.colors.body];
  return p && p.brand !== brand.value ? paints.brands.find((b) => b.key === p.brand)?.label || p.brand : "";
});
// the base: the body's paint when it has one of this brand, else the selected part's
const base = computed(() => {
  for (const key of ["body", house.selectedPart]) {
    const p = paints.byId[house.colors[key]];
    if (p && p.brand === brand.value) return p;
  }
  return null;
});

const harmony = ref([]);
const coordinating = ref([]);
const ai = ref([]);
const mood = ref("");
const busy = ref({ harmony: false, ai: false });

// the latest load — an earlier one that answers later (another base or brand) is dropped
let harmonySeq = 0;
async function loadHarmony() {
  const seq = ++harmonySeq;
  harmony.value = [];
  coordinating.value = [];
  busy.value.harmony = false;
  if (!base.value || !brand.value) return;
  busy.value.harmony = true;
  try {
    const [h, c] = await Promise.all([paints.harmony(base.value.id, brand.value), paints.coordinating(base.value.id).catch(() => [])]);
    if (seq !== harmonySeq) return;
    harmony.value = h;
    coordinating.value = c;
  } catch (e) {
    if (seq === harmonySeq) reportError(e);
  } finally {
    if (seq === harmonySeq) busy.value.harmony = false;
  }
}
watch([() => base.value?.id, brand], loadHarmony, { immediate: true });

// this house's AI schemes run, shown under the form while it runs (app-structure §8)
const aiTask = useSurfaceTask("schemes.suggest", () => ({ houseId: house.house?.id }));

async function askAi() {
  busy.value.ai = true;
  try {
    const body = { houseId: house.house.id, brand: brand.value, ...(mood.value.trim() ? { mood: mood.value.trim() } : {}) };
    const out = await withAiTask({ feature: "schemes.suggest", label: t("schemes.ai.task", { name: house.house.name }), meta: { houseId: house.house.id } }, async (task) => {
      const r = await post("/v1/schemes/ai", body, { signal: task.signal });
      return { result: r, usage: r.usage, model: r.model };
    });
    ai.value = out.schemes;
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  } finally {
    busy.value.ai = false;
  }
}

function apply(scheme) {
  for (const role of ROLES) if (scheme.roles?.[role]?.paint) paints.remember([scheme.roles[role].paint]);
  house.applyScheme(scheme, settings.values["schemes.roleParts"]);
}

// a role's swatch: its paint, or the "none" swatch (app.scss) when the scheme has no paint for it
function roleSwatch(s, role) {
  const paint = s.roles?.[role]?.paint;
  return paint ? { style: { background: paint.hex }, title: paint.displayName } : { class: "swatch--none" };
}
// why a scheme can't be applied, in words (services/schemeNotes.js) — never a silent disabled Apply
const why = (s) => schemeReasons(s).map((key) => t(key)).join(" ");

const kindLabel = (s) => (s.kind === "ai" ? s.name : s.kind === "coordinating" ? t("schemes.kinds.coordinating") : t(`schemes.kinds.${s.kind}`));
</script>

<template>
  <div class="schemes">
    <!-- no paint colors yet: the one way forward, as the Colors tab (was a dead end — the template audit) -->
    <EmptyState v-if="!paints.ready.length && paints.autoLoadingBrands" icon="Palette" compact :message="t('colors.loadingBrands')" />
    <EmptyState
      v-else-if="!paints.ready.length" icon="Palette" compact :message="t('colors.none')" :action-label="t('colors.addBrand')"
      @action="router.push('/colors')"
    />
    <template v-else>
      <p class="hint">{{ t("schemes.hint") }}</p>
      <div class="schemes__row">
        <UiSelect v-model="brand" :options="brandOptions" width="name" :aria-label="t('colors.brand')" />
      </div>

      <h3 class="schemes__h">{{ t("schemes.harmony.title") }}</h3>
      <p v-if="!base && bodyBrand" class="muted">{{ t("schemes.harmony.otherBrand", { brand: bodyBrand }) }}</p>
      <p v-else-if="!base" class="muted">{{ t("schemes.harmony.needBase") }}</p>
      <p v-else class="muted">{{ t("schemes.harmony.from", { paint: base.displayName }) }}</p>

      <ul class="schemes__list">
        <li v-for="(s, i) in [...coordinating, ...harmony]" :key="`h${i}`" class="scheme">
          <!-- a role with no paint shows the "none" swatch; why it has none is said under the name -->
          <div class="scheme__colors" aria-hidden="true">
            <span v-for="role in ROLES" :key="role" class="scheme__color" v-bind="roleSwatch(s, role)" />
          </div>
          <div class="scheme__text">
            <strong>{{ kindLabel(s) }}</strong>
            <span class="muted">{{ ROLES.map((r) => s.roles?.[r]?.paint?.displayName).filter(Boolean).join(" · ") }}</span>
            <span v-if="!s.complete" :id="`schemes-why-h${i}`" class="scheme__why">{{ why(s) }}</span>
          </div>
          <UiButton
            intent="secondary" size="small" :disabled="!s.complete" :aria-describedby="s.complete ? undefined : `schemes-why-h${i}`"
            :label="t('schemes.apply')" @click="apply(s)"
          />
        </li>
      </ul>

      <h3 class="schemes__h">{{ t("schemes.ai.title") }}</h3>
      <p class="hint">{{ t("schemes.ai.hint") }}</p>
      <q-form class="form__row" @submit="askAi">
        <UiField :label="t('schemes.ai.mood')" layout="block" for="schemes-mood">
          <UiInput id="schemes-mood" v-model="mood" width="prose" :placeholder="t('schemes.ai.moodPlaceholder')" lazy-rules :rules="rules.mood" />
        </UiField>
        <UiButton type="submit" intent="primary" :disabled="busy.ai || !!aiTask || !house.parts.length" :label="busy.ai ? t('schemes.ai.asking') : t('schemes.ai.ask')" />
      </q-form>
      <AiTaskStrip :task="aiTask" />
      <p v-if="!house.parts.length" class="muted">{{ t("schemes.ai.needParts") }}</p>
      <ul class="schemes__list">
        <li v-for="(s, i) in ai" :key="`a${i}`" class="scheme">
          <div class="scheme__colors" aria-hidden="true">
            <span v-for="role in ROLES" :key="role" class="scheme__color" v-bind="roleSwatch(s, role)" />
          </div>
          <div class="scheme__text">
            <strong>{{ s.name }}</strong>
            <span>{{ s.why }}</span>
            <span class="muted">{{ ROLES.map((r) => s.roles?.[r]?.paint?.displayName).filter(Boolean).join(" · ") }}</span>
            <span v-if="!s.complete" :id="`schemes-why-a${i}`" class="scheme__why">{{ why(s) }}</span>
          </div>
          <UiTag intent="accent2" :value="t('schemes.ai.tag')" />
          <UiButton
            intent="secondary" size="small" :disabled="!s.complete" :aria-describedby="s.complete ? undefined : `schemes-why-a${i}`"
            :label="t('schemes.apply')" @click="apply(s)"
          />
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.schemes__row {
  display: flex;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
}
.schemes__h {
  font-size: var(--fs-small);
  font-weight: 600;
  margin: var(--sp-3) 0 var(--sp-1);
}
.schemes__list {
  list-style: none;
  padding: 0;
  margin: var(--sp-2) 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.scheme {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.scheme__colors {
  display: flex;
  flex: 0 0 auto;
}
.scheme__color {
  width: 22px;
  height: 32px;
  border: 1px solid var(--border);
}
.scheme__color:first-child {
  width: 34px;
  border-radius: 4px 0 0 4px;
}
.scheme__color:last-child {
  border-radius: 0 4px 4px 0;
}
.scheme__text {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--fs-small);
}
.scheme__why {
  color: var(--ink-2);
}
</style>
