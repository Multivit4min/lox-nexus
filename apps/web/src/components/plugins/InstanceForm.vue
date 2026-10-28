<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue"
import type { PluginInstanceDto, PluginInstanceInput, PluginPackageDto } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ApiError } from "../../api/ApiError.ts"
import { SchemaDraft, type Draft } from "../../lib/schema/SchemaDraft.ts"
import { SchemaFields, type JsonSchemaNode } from "../../lib/schema/SchemaField.ts"
import { Slug } from "../../lib/Slug.ts"
import FormField from "../FormField.vue"
import SchemaFieldInput from "../schema/SchemaFieldInput.vue"

/**
 * Create or edit a plugin instance: which plugin (fixed once created), name, topic name, and the
 * config as the plugin's schema describes it. The plugin validates the config when it starts; a
 * refusal shows up as the instance's error, not here.
 */
const props = defineProps<{ packages: PluginPackageDto[]; initial?: PluginInstanceDto; submit: (input: PluginInstanceInput) => Promise<void> }>()

const plugin = ref(props.initial?.plugin ?? props.packages[0]?.id ?? "")
const label = ref(props.initial?.label ?? "")
const slug = ref(props.initial?.slug ?? "")
const slugEdited = ref(!!props.initial)
const enabled = ref(props.initial?.enabled ?? true)
const pkg = computed(() => props.packages.find(p => p.id === plugin.value))
const field = computed(() => (pkg.value ? SchemaFields.parse(pkg.value.description.config as JsonSchemaNode) : undefined))
// shallow: a deep ref over the recursive Draft type is too deep for the type checker, and drafts are replaced, not mutated
const draft = shallowRef<Draft>(null)
const failure = ref<string>()
const busy = ref(false)

// a new plugin choice starts its config from that plugin's defaults
watch(field, root => (draft.value = root ? SchemaDraft.from(root, props.initial?.config) : null), { immediate: true })
watch(label, name => {
  if (!slugEdited.value) slug.value = Slug.from(name)
})

async function onSubmit() {
  // the field sits under "Advanced", where the browser's own required check couldn't point at it
  if (!slug.value) return void (failure.value = slugEdited.value ? "Set a topic name under Advanced" : "The name needs a letter or digit, or set a topic name under Advanced")
  busy.value = true
  failure.value = undefined
  try {
    const value = field.value ? SchemaDraft.value(field.value, draft.value) : undefined
    const config = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
    await props.submit({ plugin: plugin.value, label: label.value, slug: slug.value, enabled: enabled.value, config })
  } catch (error) {
    failure.value = error instanceof ApiError ? error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") || error.message : String(error instanceof Error ? error.message : error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="grid gap-4" @submit.prevent="onSubmit">
    <div class="grid grid-cols-2 gap-4">
      <FormField v-if="!initial" id="plugin" label="Plugin" class="col-span-2">
        <Select v-model="plugin">
          <SelectTrigger id="plugin" class="w-full"><SelectValue placeholder="Choose a plugin" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="p in packages" :key="p.id" :value="p.id">{{ p.name }} · {{ p.version }}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <FormField id="label" label="Name" class="col-span-2" hint="e.g. the place or device it connects to: Home, Garage inverter">
        <Input id="label" v-model="label" required maxlength="100" />
      </FormField>
    </div>
    <div v-if="field" class="max-h-[50vh] overflow-y-auto pr-1">
      <SchemaFieldInput id="config" v-model="draft" :field="field" :secrets="initial?.secrets" />
    </div>
    <label class="flex items-center gap-2 text-sm"><Switch v-model="enabled" /> Start now and whenever Nexus starts</label>
    <details class="text-sm">
      <summary class="cursor-pointer text-muted-foreground">Advanced</summary>
      <FormField
        id="slug" label="Topic name" class="mt-3"
        :hint="initial ? 'Changing it moves the topics of all its sensors and actuators' : 'Made from the name; its signals appear on the bus under this'"
      >
        <Input id="slug" v-model="slug" @input="slugEdited = true" />
      </FormField>
      <p class="mt-1 font-mono text-xs text-muted-foreground">{{ plugin || "…" }}/{{ slug || "…" }}/…</p>
    </details>
    <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
    <Button type="submit" :disabled="busy || !pkg">{{ initial ? "Save" : "Add instance" }}</Button>
  </form>
</template>
