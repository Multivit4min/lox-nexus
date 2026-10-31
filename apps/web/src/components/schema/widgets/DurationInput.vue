<script setup lang="ts">
import { reactive, watch } from "vue"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DurationDraft } from "../../../lib/schema/DurationDraft.ts"
import { SchemaWidgets, type DurationUnit } from "../../../lib/schema/SchemaWidget.ts"

/**
 * A duration as a number with a unit to pick (seconds, minutes, hours); the value stays in the
 * field's own unit, so "2" minutes is stored as "120" for a field in seconds.
 */
const props = defineProps<{ id: string; modelValue: string; unit: DurationUnit; required?: boolean; placeholder?: string }>()
const emit = defineEmits<{ "update:modelValue": [value: string] }>()

const LABELS: Record<DurationUnit, string> = { ms: "milliseconds", s: "seconds", min: "minutes", h: "hours" }
// units at least as coarse as the field's: a field in seconds can't hold milliseconds
const units = SchemaWidgets.UNITS.filter(unit => SchemaWidgets.MS[unit] >= SchemaWidgets.MS[props.unit])
const draft = reactive(new DurationDraft(props.modelValue, props.unit))
watch(() => props.modelValue, value => draft.receive(value))
</script>

<template>
  <div class="flex gap-2">
    <Input :id="id" :model-value="draft.text" inputmode="decimal" class="w-32" :required="required" :placeholder="placeholder" @update:model-value="value => emit('update:modelValue', draft.type(String(value)))" />
    <Select :model-value="draft.unit" @update:model-value="value => draft.pick(value as DurationUnit)">
      <SelectTrigger class="w-36" :aria-label="`unit of ${id}`"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem v-for="choice in units" :key="choice" :value="choice">{{ LABELS[choice] }}</SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
