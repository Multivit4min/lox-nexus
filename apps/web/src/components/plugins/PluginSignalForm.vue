<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue"
import type { PluginSignalDto, PluginSignalInput } from "@lox-nexus/api"
import type { CatalogEntry, PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ApiError } from "../../api/ApiError.ts"
import { SchemaDraft, type Draft } from "../../lib/schema/SchemaDraft.ts"
import { SchemaFields, type JsonSchemaNode } from "../../lib/schema/SchemaField.ts"
import FormField from "../FormField.vue"
import SchemaFieldInput from "../schema/SchemaFieldInput.vue"

/**
 * Add or edit a plugin signal: which sensor or actuator (fixed kind once created), its name and
 * topic name, and its params as the plugin describes them. `preset` starts from a catalog entry.
 * The plugin checks the params; a refusal comes back as the request's error.
 */
const props = defineProps<{
  description: PluginDescription
  initial?: PluginSignalDto
  preset?: CatalogEntry
  submit: (input: PluginSignalInput) => Promise<void>
}>()

const start = props.initial ?? props.preset
const choice = ref(start ? `${start.kind}:${start.capability}` : "")
const label = ref(props.initial?.label ?? props.preset?.label ?? "")
const slug = ref(props.initial?.slug ?? "")
// shallow: a deep ref over the recursive Draft type is too deep for the type checker, and drafts are replaced, not mutated
const draft = shallowRef<Draft>(null)
const failure = ref<string>()
const busy = ref(false)

const capability = computed(() => {
  // the kind never has a ":", a capability id might
  const at = choice.value.indexOf(":")
  const kind = choice.value.slice(0, at) as "sensor" | "actuator"
  const id = choice.value.slice(at + 1)
  const list = kind === "sensor" ? props.description.sensors : props.description.actuators
  const found = list.find(c => c.id === id)
  return found ? { kind, ...found, field: SchemaFields.parse(found.params as JsonSchemaNode) } : undefined
})
const startParams = start?.params
watch(capability, (current, previous) => {
  // the params of the signal or entry apply to its own capability only
  const keep = !previous && start && current && `${current.kind}:${current.id}` === `${start.kind}:${start.capability}`
  draft.value = current ? SchemaDraft.from(current.field, keep ? startParams : undefined) : null
}, { immediate: true })

async function onSubmit() {
  const current = capability.value
  if (!current) return
  busy.value = true
  failure.value = undefined
  try {
    const params = SchemaDraft.value(current.field, draft.value) ?? {}
    await props.submit({ kind: current.kind, capability: current.id, params, label: label.value, ...(slug.value ? { slug: slug.value } : {}) })
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
    if (error instanceof ApiError && error.issues.length) failure.value = error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="grid gap-4" @submit.prevent="onSubmit">
    <FormField id="capability" label="Sensor or actuator">
      <Select v-model="choice">
        <SelectTrigger id="capability" class="w-full" :disabled="!!initial"><SelectValue placeholder="Choose what to add" /></SelectTrigger>
        <SelectContent>
          <SelectGroup v-if="description.sensors.length">
            <SelectLabel>Sensors: values from the device</SelectLabel>
            <SelectItem v-for="c in description.sensors" :key="c.id" :value="`sensor:${c.id}`">{{ c.label }} · {{ c.valueType }}</SelectItem>
          </SelectGroup>
          <SelectGroup v-if="description.actuators.length">
            <SelectLabel>Actuators: commands to the device</SelectLabel>
            <SelectItem v-for="c in description.actuators" :key="c.id" :value="`actuator:${c.id}`">{{ c.label }} · {{ c.valueType }}</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </FormField>
    <div class="grid grid-cols-2 gap-4">
      <FormField id="signalLabel" label="Name"><Input id="signalLabel" v-model="label" required maxlength="100" /></FormField>
      <FormField id="signalSlug" label="Topic name" hint="optional, defaults to one from the name"><Input id="signalSlug" v-model="slug" /></FormField>
    </div>
    <div v-if="capability?.field.fields?.length" class="max-h-[45vh] overflow-y-auto pr-1">
      <SchemaFieldInput id="params" v-model="draft" :field="capability.field" />
    </div>
    <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
    <Button type="submit" :disabled="busy || !capability">{{ initial ? "Save" : "Add signal" }}</Button>
  </form>
</template>
