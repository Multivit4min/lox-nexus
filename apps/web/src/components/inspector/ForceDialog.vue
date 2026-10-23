<script setup lang="ts">
import { ref, watch } from "vue"
import type { Value, ValueType } from "@lox-nexus/plugin-sdk/values"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { AppContext } from "../../AppContext.ts"
import { ApiError } from "../../api/ApiError.ts"
import { ValueDraft } from "../../lib/ValueDraft.ts"
import FormField from "../FormField.vue"
import ValueEditor from "./ValueEditor.vue"

/**
 * Pins a topic to a value. While forced, every subscriber (wires, the Miniserver) sees this value;
 * real publishes are still recorded as "shadowed". Prefilled with the topic's current value.
 */
const props = defineProps<{ topic: string; current?: Value }>()
const open = defineModel<boolean>("open", { required: true })
const emit = defineEmits<{ done: [] }>()
const { bus } = AppContext.use()

const draft = ref<{ type: ValueType; text: string }>(ValueDraft.from(undefined))
const reason = ref("")
const minutes = ref("")
const error = ref("")

watch(open, isOpen => {
  if (!isOpen) return
  draft.value = ValueDraft.from(props.current)
  reason.value = ""
  minutes.value = ""
  error.value = ""
})

async function submit() {
  const parsed = ValueDraft.parse(draft.value.type, draft.value.text)
  if ("error" in parsed) return void (error.value = parsed.error)
  const duration = Number(minutes.value)
  try {
    await bus.force({
      topic: props.topic, value: parsed.value,
      ...(reason.value ? { reason: reason.value } : {}),
      ...(duration > 0 ? { until: Date.now() + duration * 60_000 } : {})
    })
    open.value = false
    emit("done")
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : String(failure)
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Force value</DialogTitle>
        <DialogDescription class="font-mono">{{ topic }}</DialogDescription>
      </DialogHeader>
      <form class="grid gap-4" @submit.prevent="submit">
        <FormField id="force-value" label="Value">
          <ValueEditor v-model:type="draft.type" v-model:text="draft.text" />
        </FormField>
        <FormField id="force-reason" label="Reason" hint="shown in the inspector">
          <Input id="force-reason" v-model="reason" maxlength="500" placeholder="e.g. maintenance" />
        </FormField>
        <FormField id="force-minutes" label="Release automatically after (minutes)" hint="empty: until released by hand">
          <Input id="force-minutes" v-model="minutes" type="number" min="1" step="1" />
        </FormField>
        <Alert v-if="error" variant="destructive"><AlertDescription>{{ error }}</AlertDescription></Alert>
        <DialogFooter><Button type="submit">Force</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
