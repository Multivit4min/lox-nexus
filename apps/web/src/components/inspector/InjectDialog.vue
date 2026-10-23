<script setup lang="ts">
import { ref, watch } from "vue"
import type { Value, ValueType } from "@lox-nexus/plugin-sdk/values"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { AppContext } from "../../AppContext.ts"
import { ApiError } from "../../api/ApiError.ts"
import { ValueDraft } from "../../lib/ValueDraft.ts"
import FormField from "../FormField.vue"
import ValueEditor from "./ValueEditor.vue"

/** Publishes one value by hand, flagged "injected", e.g. to test a wire without touching the Miniserver. */
const props = defineProps<{ topic?: string; current?: Value }>()
const open = defineModel<boolean>("open", { required: true })
const { bus } = AppContext.use()

const target = ref("")
// every known signal topic as suggestions; the browser's datalist filters as the user types
const topics = ref<string[]>([])
const asCommand = ref(false)
const draft = ref<{ type: ValueType; text: string }>(ValueDraft.from(undefined))
const error = ref("")

watch(open, isOpen => {
  if (!isOpen) return
  void bus.signals().then(signals => (topics.value = signals.map(s => s.topic).sort()), () => undefined)
  target.value = props.topic ?? ""
  draft.value = ValueDraft.from(props.current)
  error.value = ""
})

async function submit() {
  const parsed = ValueDraft.parse(draft.value.type, draft.value.text)
  if ("error" in parsed) return void (error.value = parsed.error)
  try {
    await bus.inject({ topic: target.value, value: parsed.value, kind: asCommand.value ? "command" : "state" })
    open.value = false
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : String(failure)
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Inject a value</DialogTitle>
        <DialogDescription>Published once, as if a device had sent it. Wires react to it.</DialogDescription>
      </DialogHeader>
      <form class="grid gap-4" @submit.prevent="submit">
        <FormField id="inject-topic" label="Topic">
          <Input id="inject-topic" v-model="target" class="font-mono" placeholder="loxone/haus/in/…" list="inject-topics" autocomplete="off" required />
          <datalist id="inject-topics"><option v-for="known in topics" :key="known" :value="known"></option></datalist>
        </FormField>
        <FormField id="inject-value" label="Value">
          <ValueEditor v-model:type="draft.type" v-model:text="draft.text" />
        </FormField>
        <label class="flex items-center gap-2 text-sm"><Switch v-model="asCommand" /> Send as command (not retained, never deduplicated)</label>
        <Alert v-if="error" variant="destructive"><AlertDescription>{{ error }}</AlertDescription></Alert>
        <DialogFooter><Button type="submit">Inject</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
