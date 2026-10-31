<script setup lang="ts">
import { computed } from "vue"
import { Input } from "@/components/ui/input"
import type { Draft } from "../../lib/schema/SchemaDraft.ts"
import type { SchemaField } from "../../lib/schema/SchemaField.ts"
import ChipsInput from "./widgets/ChipsInput.vue"
import DurationInput from "./widgets/DurationInput.vue"
import FileInput from "./widgets/FileInput.vue"

/** A field with its own input (field.widget): a duration, a time, a colour, a slider, a file or chips. */
const props = defineProps<{ field: SchemaField; modelValue: Draft; id: string; required?: boolean; placeholder?: string }>()
const emit = defineEmits<{ "update:modelValue": [value: Draft] }>()
const text = computed(() => (typeof props.modelValue === "string" ? props.modelValue : ""))
const widget = computed(() => props.field.widget!)
const set = (value: unknown) => emit("update:modelValue", String(value))
</script>

<template>
  <DurationInput v-if="widget.kind === 'duration'" :id="id" :model-value="text" :unit="widget.unit" :required="required" :placeholder="placeholder" @update:model-value="set" />
  <Input v-else-if="widget.kind === 'time'" :id="id" type="time" class="w-36" :model-value="text" :required="required" @update:model-value="set" />
  <div v-else-if="widget.kind === 'color'" class="flex items-center gap-2">
    <input :id="id" type="color" class="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1" :value="text || '#000000'" @input="event => set((event.target as HTMLInputElement).value)" />
    <Input :model-value="text" class="w-32 font-mono" placeholder="#rrggbb" :aria-label="`${field.label} as hex`" :required="required" @update:model-value="set" />
  </div>
  <div v-else-if="widget.kind === 'slider'" class="flex items-center gap-3">
    <input
      :id="id" type="range" class="w-full max-w-sm accent-primary" :min="field.minimum" :max="field.maximum" :step="widget.step"
      :value="text || field.minimum" @input="event => set((event.target as HTMLInputElement).value)"
    />
    <Input :model-value="text" class="w-24 tabular-nums" inputmode="decimal" :aria-label="`${field.label} as number`" :placeholder="placeholder" @update:model-value="set" />
  </div>
  <FileInput v-else-if="widget.kind === 'file'" :id="id" :model-value="text" :max-bytes="widget.maxBytes" :base64="widget.base64" :accept="widget.accept" :placeholder="placeholder" @update:model-value="set" />
  <ChipsInput
    v-else-if="widget.kind === 'chips'" :id="id" :model-value="Array.isArray(modelValue) ? modelValue : []" :options="field.items?.options ?? []"
    :labels="field.items?.optionLabels ?? field.optionLabels" @update:model-value="value => emit('update:modelValue', value)"
  />
</template>
