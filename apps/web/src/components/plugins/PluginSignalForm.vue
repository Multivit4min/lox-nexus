<script setup lang="ts">
import { computed, nextTick, reactive, ref, shallowRef, watch } from "vue"
import type { PluginSignalDto, PluginSignalInput } from "@lox-nexus/api"
import type { CatalogEntry, PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ApiError } from "../../api/ApiError.ts"
import { SignalDisplayDraft } from "../../lib/SignalDisplayDraft.ts"
import { SchemaDraft, type Draft } from "../../lib/schema/SchemaDraft.ts"
import { SchemaFields, type JsonSchemaNode } from "../../lib/schema/SchemaField.ts"
import FormField from "../FormField.vue"
import SignalDisplayFields from "../SignalDisplayFields.vue"
import SchemaFieldInput from "../schema/SchemaFieldInput.vue"
import CapabilityPicker from "./CapabilityPicker.vue"

/**
 * Add or edit a plugin signal. Adding starts by picking what the plugin offers (skipped for a
 * catalog entry, `preset`); then the name and the settings the plugin asks for. The topic name is
 * advanced: it defaults to one from the name. Kind and capability are fixed once created; a
 * signal whose capability the plugin no longer offers (orphaned) can't be edited, only explained.
 * The plugin checks the settings; a refusal comes back as the request's error.
 */
const props = defineProps<{
  description: PluginDescription
  /** the instance's topic prefix, e.g. "homeassistant/home", to show where the signal appears */
  topicBase: string
  initial?: PluginSignalDto
  preset?: CatalogEntry
  submit: (input: PluginSignalInput) => Promise<void>
}>()

const start = props.initial ?? props.preset
const choice = ref(start ? `${start.kind}:${start.capability}` : "")
const label = ref(props.initial?.label ?? props.preset?.label ?? "")
const labelEdited = ref(!!start)
const slug = ref(props.initial?.slug ?? "")
// shallow: a deep ref over the recursive Draft type is too deep for the type checker, and drafts are replaced, not mutated
const draft = shallowRef<Draft>(null)
const failure = ref<string>()
const busy = ref(false)
// a catalog entry's unit, where it fits a signal
const presetUnit = SignalDisplayDraft.unitOf(props.preset)
const display = reactive(new SignalDisplayDraft(props.initial ?? (presetUnit ? { unit: presetUnit } : {})))

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
  // a new signal starts with what its class suggests, where the catalog entry doesn't say
  if (current && !props.initial) Object.assign(display, new SignalDisplayDraft({ ...current, ...(presetUnit ? { unit: presetUnit } : {}) }))
}, { immediate: true })

// a fresh signal is named after the param the plugin marked with signalName() (a hook, a variable)
// as it is typed, otherwise after what it is, until the user names it
watch([capability, draft], ([current, params]) => {
  if (!current || labelEdited.value) return
  const field = current.field.fields?.find(candidate => candidate.signalName)
  const typed = field && params && typeof params === "object" && !Array.isArray(params) ? params[field.name] : undefined
  label.value = typeof typed === "string" && typed.trim() ? typed.trim() : current.label
}, { immediate: true })

// keyboard focus would otherwise fall back to the dialog when the picked button disappears
function pick(value: string) {
  choice.value = value
  void nextTick(() => document.getElementById("signalLabel")?.focus())
}

const topic = computed(() => `${props.topicBase}/${capability.value?.kind ?? "…"}/${slug.value || "…"}`)

async function onSubmit() {
  const current = capability.value
  if (!current) return
  busy.value = true
  failure.value = undefined
  try {
    const params = SchemaDraft.value(current.field, draft.value) ?? {}
    await props.submit({
      kind: current.kind, capability: current.id, params, label: label.value, ...(slug.value ? { slug: slug.value } : {}),
      ...(SignalDisplayDraft.applies(current.valueType) ? display.input() : {})
    })
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
    if (error instanceof ApiError && error.issues.length) failure.value = error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Alert v-if="initial && !capability">
    <AlertDescription>
      This version of the plugin no longer offers "{{ initial.capability }}", so the {{ initial.kind }} can't be changed. Roll the plugin back
      to use it again, or delete it.
    </AlertDescription>
  </Alert>
  <CapabilityPicker v-else-if="!capability" :description="description" @pick="pick" />
  <form v-else class="grid gap-4" @submit.prevent="onSubmit">
    <div class="flex items-start gap-3 rounded-md border bg-muted/40 px-3 py-2">
      <div class="grid min-w-0 flex-1 gap-0.5">
        <span class="flex flex-wrap items-center gap-2 text-sm font-medium">
          {{ capability.label }}
          <Badge as="span" variant="outline" class="font-normal">{{ capability.kind === "sensor" ? "reads from the device" : "controls the device" }}</Badge>
        </span>
        <span v-if="capability.description" class="text-xs text-muted-foreground">{{ capability.description }}</span>
      </div>
      <Button v-if="!initial" type="button" variant="ghost" size="sm" @click="choice = ''">Change</Button>
    </div>
    <FormField id="signalLabel" label="Name" hint="How it is listed here, in wires and in the Bus Inspector">
      <Input id="signalLabel" v-model="label" required maxlength="100" @input="labelEdited = true" />
    </FormField>
    <section v-if="capability.field.fields?.length" class="grid gap-2">
      <h3 class="text-sm font-medium">Settings</h3>
      <div class="max-h-[45vh] overflow-y-auto pr-1">
        <SchemaFieldInput id="params" v-model="draft" :field="capability.field" />
      </div>
    </section>
    <SignalDisplayFields v-if="SignalDisplayDraft.applies(capability.valueType)" v-model:unit="display.unit" v-model:decimals="display.decimals" id-prefix="signal" />
    <details class="text-sm">
      <summary class="cursor-pointer text-muted-foreground">Advanced</summary>
      <FormField id="signalSlug" label="Topic name" class="mt-3" hint="Leave empty to make one from the name">
        <Input id="signalSlug" v-model="slug" />
      </FormField>
      <p class="mt-1 font-mono text-xs break-all text-muted-foreground">{{ topic }}</p>
    </details>
    <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
    <Button type="submit" :disabled="busy">{{ initial ? "Save" : capability.kind === "sensor" ? "Add sensor" : "Add actuator" }}</Button>
  </form>
</template>
