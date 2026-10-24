<script setup lang="ts">
import type { ValueType } from "@lox-nexus/plugin-sdk/values"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ValueDraft } from "../../lib/ValueDraft.ts"
import type { ValueText } from "../../lib/wires/TransformDraft.ts"

/** A value on one line: its type and its text (JSON for structured types). Emits new objects. */
const props = defineProps<{ modelValue: ValueText; label: string }>()
const emit = defineEmits<{ "update:modelValue": [value: ValueText] }>()

const setType = (type: ValueType) => emit("update:modelValue", { type, text: type === props.modelValue.type ? props.modelValue.text : ValueDraft.from(undefined, type).text })
</script>

<template>
  <div class="flex min-w-0 flex-1 gap-1">
    <Select :model-value="modelValue.type" @update:model-value="v => setType(v as ValueType)">
      <SelectTrigger class="h-8 w-28 shrink-0" :aria-label="`${label} type`"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem v-for="type in ValueDraft.TYPES" :key="type" :value="type">{{ type }}</SelectItem>
      </SelectContent>
    </Select>
    <Input
      v-if="modelValue.type !== 'null'" class="h-8 min-w-0 flex-1 font-mono text-xs" :aria-label="label" :model-value="modelValue.text"
      @update:model-value="v => emit('update:modelValue', { type: modelValue.type, text: String(v) })"
    />
  </div>
</template>
