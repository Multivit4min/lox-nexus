<script setup lang="ts">
import { computed } from "vue"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { StepDraft } from "../../lib/wires/TransformDraft.ts"
import { ValueDraft } from "../../lib/ValueDraft.ts"
import MapCases from "./MapCases.vue"

/** The fields of one transform step. Edits are emitted as a new draft, never by changing the one passed in. */
const props = defineProps<{ id: string; modelValue: StepDraft }>()
const emit = defineEmits<{ "update:modelValue": [value: StepDraft] }>()

// event handlers in the template don't see the narrowing of v-if, so the scale fields get their own ref
const scale = computed(() => (props.modelValue.op === "scale" ? props.modelValue : undefined))
const patch = (changes: Record<string, unknown>) => emit("update:modelValue", { ...props.modelValue, ...changes } as StepDraft)
function setRange(key: "from" | "to", index: 0 | 1, text: string | number) {
  if (!scale.value) return
  const range: [string, string] = [...scale.value[key]]
  range[index] = String(text)
  patch({ [key]: range })
}
</script>

<template>
  <p v-if="modelValue.op === 'invert'" class="text-xs text-muted-foreground">true ↔ false; numbers count as true unless 0.</p>
  <div v-else-if="scale" class="grid gap-2">
    <div class="flex flex-wrap items-center gap-1.5 text-sm">
      <span class="w-8 text-muted-foreground">from</span>
      <Input :id="`${id}-from0`" class="h-8 w-20" aria-label="from minimum" :model-value="scale.from[0]" @update:model-value="v => setRange('from', 0, v)" />
      …
      <Input class="h-8 w-20" aria-label="from maximum" :model-value="scale.from[1]" @update:model-value="v => setRange('from', 1, v)" />
      <span class="px-1 text-muted-foreground">to</span>
      <Input class="h-8 w-20" aria-label="to minimum" :model-value="scale.to[0]" @update:model-value="v => setRange('to', 0, v)" />
      …
      <Input class="h-8 w-20" aria-label="to maximum" :model-value="scale.to[1]" @update:model-value="v => setRange('to', 1, v)" />
    </div>
    <label class="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch :model-value="scale.clamp" @update:model-value="v => patch({ clamp: v === true })" />
      keep results inside the target range (otherwise values outside "from" are extrapolated)
    </label>
  </div>
  <div v-else-if="modelValue.op === 'debounce' || modelValue.op === 'throttle'" class="flex items-center gap-2 text-sm">
    <Input :id="`${id}-ms`" class="h-8 w-28" aria-label="milliseconds" :model-value="modelValue.ms" @update:model-value="v => patch({ ms: String(v) })" />
    <span class="text-muted-foreground">ms</span>
  </div>
  <div v-else-if="modelValue.op === 'convert'" class="flex items-center gap-2 text-sm">
    <span class="text-muted-foreground">to</span>
    <Select :model-value="modelValue.to" @update:model-value="v => patch({ to: v })">
      <SelectTrigger :id="`${id}-to`" class="h-8 w-40"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem v-for="type in ValueDraft.TYPES" :key="type" :value="type">{{ type }}</SelectItem>
      </SelectContent>
    </Select>
  </div>
  <MapCases v-else-if="modelValue.op === 'map'" :id="id" :model-value="modelValue" @update:model-value="value => emit('update:modelValue', value)" />
</template>
