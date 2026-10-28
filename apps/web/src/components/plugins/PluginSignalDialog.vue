<script setup lang="ts">
import { ref, watch } from "vue"
import type { PluginSignalDto, PluginSignalInput } from "@lox-nexus/api"
import type { CatalogEntry, PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppContext } from "../../AppContext.ts"
import PluginSignalForm from "./PluginSignalForm.vue"

/** What the dialog is for: a new signal (optionally from a catalog entry), or an existing one to edit. */
export interface SignalDialogTarget {
  initial?: PluginSignalDto
  preset?: CatalogEntry
}

/** Adds a sensor or actuator to an instance, or edits one. Emits `saved` after the server took it. */
const props = defineProps<{ instanceId: string; description: PluginDescription; topicBase: string }>()
const emit = defineEmits<{ saved: [] }>()
const target = defineModel<SignalDialogTarget | undefined>("target", { required: true })
const api = AppContext.use().plugins
// kept while the dialog animates closed, so an edit dialog doesn't turn into "Add" on its way out
const title = ref("")
watch(target, current => {
  if (current) title.value = current.initial ? `Edit ${current.initial.label}` : "Add a sensor or actuator"
}, { immediate: true })

async function submit(input: PluginSignalInput) {
  const initial = target.value?.initial
  if (initial) await api.updateSignal(props.instanceId, initial.id, input)
  else await api.addSignal(props.instanceId, input)
  target.value = undefined
  emit("saved")
}
</script>

<template>
  <Dialog :open="!!target" @update:open="open => !open && (target = undefined)">
    <DialogContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription class="sr-only">Sensors read values from the device, actuators control it.</DialogDescription>
      </DialogHeader>
      <PluginSignalForm
        v-if="target" :key="target.initial?.id ?? JSON.stringify(target.preset ?? 'manual')"
        :description="description" :topic-base="topicBase" :initial="target.initial" :preset="target.preset" :submit="submit"
      />
    </DialogContent>
  </Dialog>
</template>
