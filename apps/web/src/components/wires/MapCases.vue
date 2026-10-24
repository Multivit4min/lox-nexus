<script setup lang="ts">
import { Plus, X } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import type { StepDraft, ValueText } from "../../lib/wires/TransformDraft.ts"
import ValueTextInput from "./ValueTextInput.vue"

type MapDraft = Extract<StepDraft, { op: "map" }>

/** The cases of a map step and its optional fallback. Matching is type-strict: 1 is not true. */
const props = defineProps<{ id: string; modelValue: MapDraft }>()
const emit = defineEmits<{ "update:modelValue": [value: MapDraft] }>()

const NEW_VALUE: ValueText = { type: "number", text: "0" }
const cases = () => props.modelValue.cases
const update = (changes: Partial<MapDraft>) => emit("update:modelValue", { ...props.modelValue, ...changes })
const setCase = (index: number, side: "when" | "then", value: ValueText) =>
  update({ cases: cases().map((entry, i) => (i === index ? { ...entry, [side]: value } : entry)) })

function toggleOtherwise(on: boolean) {
  const next: MapDraft = { ...props.modelValue }
  delete next.otherwise
  emit("update:modelValue", on ? { ...next, otherwise: NEW_VALUE } : next)
}
</script>

<template>
  <div class="grid gap-1.5">
    <div v-for="(entry, i) in modelValue.cases" :key="i" class="flex flex-wrap items-center gap-1.5 text-sm">
      <span class="w-5 text-muted-foreground">if</span>
      <ValueTextInput :model-value="entry.when" :label="`case ${i + 1} if`" @update:model-value="v => setCase(i, 'when', v)" />
      <span class="text-muted-foreground">→</span>
      <ValueTextInput :model-value="entry.then" :label="`case ${i + 1} then`" @update:model-value="v => setCase(i, 'then', v)" />
      <Button type="button" size="icon" variant="ghost" class="size-8" :title="`Remove case ${i + 1}`" @click="update({ cases: cases().filter((_, j) => j !== i) })">
        <X class="size-4" />
      </Button>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <Button type="button" size="sm" variant="outline" class="h-7" @click="update({ cases: [...cases(), { when: NEW_VALUE, then: NEW_VALUE }] })">
        <Plus class="size-3.5" /> Case
      </Button>
      <label class="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch :id="`${id}-otherwise`" :model-value="!!modelValue.otherwise" @update:model-value="v => toggleOtherwise(v === true)" />
        other values become a fallback (otherwise they pass unchanged)
      </label>
    </div>
    <div v-if="modelValue.otherwise" class="flex items-center gap-1.5 text-sm">
      <span class="text-muted-foreground">otherwise</span>
      <ValueTextInput :model-value="modelValue.otherwise" label="fallback" @update:model-value="v => update({ otherwise: v })" />
    </div>
  </div>
</template>
