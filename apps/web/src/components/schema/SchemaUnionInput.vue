<script setup lang="ts">
import { computed } from "vue"
import { SchemaDraft, type Draft } from "../../lib/schema/SchemaDraft.ts"
import { SchemaFields, type SchemaField } from "../../lib/schema/SchemaField.ts"
import SchemaFieldInput from "./SchemaFieldInput.vue"

/**
 * A discriminated union: a choice of its discriminator's values, then the chosen branch's other
 * fields. Switching keeps what was typed into fields both branches have.
 */
const props = defineProps<{ field: SchemaField; modelValue: Draft; id: string; secrets?: string[] }>()
const emit = defineEmits<{ "update:modelValue": [value: Draft] }>()

const discriminator = computed(() => props.field.discriminator!)
const record = computed(() => (props.modelValue && typeof props.modelValue === "object" && !Array.isArray(props.modelValue) ? props.modelValue : {}))
const variant = computed(() => SchemaDraft.variant(props.field, props.modelValue))
// the discriminator as a required choice, labelled from the literals' titles and the enums' labels
const choice = computed<SchemaField>(() => ({
  name: discriminator.value, label: props.field.discriminatorLabel ?? SchemaFields.humanize(discriminator.value), kind: "enum", required: true,
  nullable: false, secret: false, hasDefault: false, options: props.field.variants!.map(entry => entry.value),
  optionLabels: Object.fromEntries(props.field.variants!.map(entry => [String(entry.value), entry.label])),
  ...(props.field.discriminatorDescription ? { description: props.field.discriminatorDescription } : {})
}))

const choose = (value: Draft) => emit("update:modelValue", SchemaDraft.choose(props.field, props.modelValue, String(value)))
const setChild = (name: string, value: Draft) => emit("update:modelValue", { ...record.value, [name]: value })
</script>

<template>
  <fieldset :class="field.name ? 'grid gap-3 rounded-md border p-3' : 'grid gap-4'">
    <legend v-if="field.name" class="px-1 text-sm font-medium">{{ field.label }}</legend>
    <SchemaFieldInput :id="`${id}-${discriminator}`" :field="choice" :model-value="record[discriminator] ?? ''" @update:model-value="choose" />
    <SchemaFieldInput
      v-for="child in variant.field.fields" :id="`${id}-${child.name}`" :key="`${variant.value}-${child.name}`" :field="child"
      :model-value="record[child.name] ?? null" :secret-set="secrets?.includes(child.name)" @update:model-value="value => setChild(child.name, value)"
    />
  </fieldset>
</template>
