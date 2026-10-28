<script setup lang="ts">
import { computed } from "vue"
import { Plus, X } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { SchemaDraft, type Draft } from "../../lib/schema/SchemaDraft.ts"
import type { SchemaField } from "../../lib/schema/SchemaField.ts"
import FormField from "../FormField.vue"
import CodeEditor from "./CodeEditor.vue"

/**
 * One field of a schema form, recursive for objects and arrays. Updates are emitted as new
 * drafts, never by changing the one passed in. `secrets` names the secret fields of this object
 * that have a stored value: their inputs stay empty and may be left empty to keep it.
 */
const props = defineProps<{ field: SchemaField; modelValue: Draft; id: string; secrets?: string[]; secretSet?: boolean }>()
const emit = defineEmits<{ "update:modelValue": [value: Draft] }>()

/** reka's Select can't hold an empty value, so "not set" has a stand-in */
const NONE = "\u0000none"

const label = computed(() => (props.field.required || props.field.kind === "boolean" ? props.field.label : `${props.field.label} (optional)`))
const text = computed(() => (typeof props.modelValue === "string" ? props.modelValue : ""))
const record = computed(() => (props.modelValue && typeof props.modelValue === "object" && !Array.isArray(props.modelValue) ? props.modelValue : {}))
const items = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []))
const needed = computed(() => props.field.required && !props.field.hasDefault && !props.field.nullable && !(props.field.secret && props.secretSet))
const placeholder = computed(() => {
  if (props.field.secret && props.secretSet) return "set; leave empty to keep it"
  if (props.field.hasDefault && props.field.default !== undefined) return `default: ${JSON.stringify(props.field.default)}`
  return props.field.nullable ? "empty for none" : ""
})
const hint = computed(() => [props.field.description, props.field.minimum !== undefined && `min ${props.field.minimum}`, props.field.maximum !== undefined && `max ${props.field.maximum}`]
  .filter(Boolean).join(" · "))

const setChild = (name: string, value: Draft) => emit("update:modelValue", { ...record.value, [name]: value })
const setItem = (index: number, value: Draft) => emit("update:modelValue", items.value.map((item, i) => (i === index ? value : item)))
const removeItem = (index: number) => emit("update:modelValue", items.value.filter((_, i) => i !== index))
const addItem = () => emit("update:modelValue", [...items.value, SchemaDraft.from(props.field.items!)])
</script>

<template>
  <fieldset v-if="field.kind === 'object'" :class="field.name ? 'grid gap-3 rounded-md border p-3' : 'grid gap-4'">
    <legend v-if="field.name" class="px-1 text-sm font-medium">{{ label }}</legend>
    <p v-if="field.name && field.description" class="text-xs text-muted-foreground">{{ field.description }}</p>
    <SchemaFieldInput
      v-for="child in field.fields" :id="`${id}-${child.name}`" :key="child.name" :field="child" :model-value="record[child.name] ?? null"
      :secret-set="secrets?.includes(child.name)" @update:model-value="value => setChild(child.name, value)"
    />
  </fieldset>
  <FormField v-else-if="field.kind === 'array'" :id="id" :label="label" :hint="hint">
    <div class="grid gap-2">
      <div v-for="(item, i) in items" :key="i" class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <SchemaFieldInput :id="`${id}-${i}`" :field="{ ...field.items!, label: `${field.label} ${i + 1}` }" :model-value="item" @update:model-value="value => setItem(i, value)" />
        </div>
        <Button type="button" size="icon" variant="ghost" class="size-9" :title="`Remove item ${i + 1}`" @click="removeItem(i)"><X class="size-4" /></Button>
      </div>
      <Button type="button" size="sm" variant="outline" class="justify-self-start" @click="addItem"><Plus class="size-4" /> Add</Button>
    </div>
  </FormField>
  <div v-else-if="field.kind === 'boolean'" class="flex items-center gap-3">
    <Switch :id="id" :model-value="modelValue === true" @update:model-value="value => emit('update:modelValue', value === true)" />
    <div class="grid">
      <label :for="id" class="text-sm font-medium">{{ label }}</label>
      <span v-if="field.description" class="text-xs text-muted-foreground">{{ field.description }}</span>
    </div>
  </div>
  <FormField v-else-if="field.kind === 'enum'" :id="id" :label="label" :hint="hint">
    <Select :model-value="text || NONE" @update:model-value="value => emit('update:modelValue', value === NONE ? '' : String(value))">
      <SelectTrigger :id="id" class="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem v-if="!field.required || field.hasDefault" :value="NONE">{{ field.hasDefault ? `Default (${field.optionLabels?.[String(field.default)] ?? field.default})` : "Not set" }}</SelectItem>
        <SelectItem v-for="option in field.options" :key="String(option)" :value="String(option)">{{ field.optionLabels?.[String(option)] ?? option }}</SelectItem>
      </SelectContent>
    </Select>
  </FormField>
  <FormField v-else-if="field.kind === 'const'" :id="id" :label="label" :hint="hint">
    <Input :id="id" :model-value="JSON.stringify(field.constValue)" disabled />
  </FormField>
  <FormField v-else-if="field.code && !field.secret" :id="id" :label="label" :hint="hint">
    <CodeEditor :id="id" :model-value="text" :language="field.code" :required="needed" :placeholder="placeholder" @update:model-value="value => emit('update:modelValue', value)" />
  </FormField>
  <FormField v-else-if="field.kind === 'json'" :id="id" :label="label" :hint="hint || 'as JSON'">
    <Textarea :id="id" :model-value="text" class="font-mono text-xs" rows="4" :required="needed" @update:model-value="value => emit('update:modelValue', String(value))" />
  </FormField>
  <FormField v-else :id="id" :label="label" :hint="hint">
    <Input
      :id="id" :model-value="text" :type="field.secret ? 'password' : 'text'"
      :placeholder="placeholder" :required="needed" :autocomplete="field.secret ? 'new-password' : 'off'"
      @update:model-value="value => emit('update:modelValue', String(value))"
    />
  </FormField>
</template>
