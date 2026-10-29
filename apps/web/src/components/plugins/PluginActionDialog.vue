<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue"
import type { ActionDescription } from "@lox-nexus/plugin-sdk/wire"
import { Play } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppContext } from "../../AppContext.ts"
import { SchemaDraft, type Draft } from "../../lib/schema/SchemaDraft.ts"
import { SchemaFields, type JsonSchemaNode } from "../../lib/schema/SchemaField.ts"
import SchemaFieldInput from "../schema/SchemaFieldInput.vue"

/**
 * Runs one of a plugin's actions: its description, a form for its input (filled in from a panel
 * row's button), the confirmation it asks for, and what the plugin answers. On a failure the form
 * stays as it was, so a mistyped code can be fixed.
 */
const props = defineProps<{ instanceId: string; action: ActionDescription; prefill?: Record<string, unknown> }>()
const open = defineModel<boolean>("open", { required: true })
const emit = defineEmits<{ done: [] }>()
const api = AppContext.use().plugins

const field = computed(() => SchemaFields.parse(props.action.input as JsonSchemaNode))
const hasInput = computed(() => Object.keys((props.action.input.properties ?? {}) as object).length > 0)
// shallow: a deep ref over the recursive Draft type is too deep for the type checker
const draft = shallowRef<Draft>(null)
const result = ref<{ ok: boolean; text: string }>()
const busy = ref(false)

watch(open, isOpen => {
  if (!isOpen) return
  draft.value = SchemaDraft.from(field.value, props.prefill)
  result.value = undefined
}, { immediate: true })

async function run() {
  if (props.action.confirm && !confirm(props.action.confirm)) return
  busy.value = true
  result.value = undefined
  try {
    const input = (SchemaDraft.value(field.value, draft.value) ?? {}) as Record<string, unknown>
    const answer = await api.action(props.instanceId, props.action.id, input)
    result.value = { ok: true, text: answer.message ?? "Done." }
    emit("done")
  } catch (error) {
    result.value = { ok: false, text: error instanceof Error ? error.message : String(error) }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ action.label }}</DialogTitle>
        <DialogDescription v-if="action.description">{{ action.description }}</DialogDescription>
      </DialogHeader>
      <form class="grid gap-4" @submit.prevent="run">
        <SchemaFieldInput v-if="hasInput" id="action-input" v-model="draft" :field="field" />
        <Alert v-if="result" :variant="result.ok ? 'default' : 'destructive'">
          <AlertDescription class="whitespace-pre-wrap">{{ result.text }}</AlertDescription>
        </Alert>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">{{ result?.ok ? "Close" : "Cancel" }}</Button>
          <Button type="submit" :disabled="busy"><Play class="size-4" /> {{ busy ? "Running…" : action.label }}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
