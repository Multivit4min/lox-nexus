<script setup lang="ts">
import { ref, watch } from "vue"
import type { InstallOutcomeDto, InstalledPluginDto, UpdateImpactDto } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppContext } from "../../../AppContext.ts"
import InstallResult from "./InstallResult.vue"
import UpdateImpactList from "./UpdateImpactList.vue"

/** Switches a plugin to its previous version after showing what that does; the two versions swap, so it can go forward again. */
const props = defineProps<{ plugin: InstalledPluginDto }>()
const emit = defineEmits<{ changed: [] }>()
const open = defineModel<boolean>("open", { required: true })
const api = AppContext.use().pluginPackages

const impact = ref<UpdateImpactDto>()
const outcome = ref<InstallOutcomeDto>()
const busy = ref(false)
const error = ref("")

watch(open, async isOpen => {
  impact.value = undefined
  outcome.value = undefined
  error.value = ""
  const previous = props.plugin.previous
  if (!isOpen || !previous) return
  try {
    impact.value = await api.impact(props.plugin.id, previous.version)
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  }
}, { immediate: true })

// a running rollback finishes in the dialog, so its result and the page's reload aren't lost
const keepOpen = (event: Event) => busy.value && event.preventDefault()

async function rollback() {
  const previous = props.plugin.previous
  if (!previous) return
  busy.value = true
  error.value = ""
  try {
    outcome.value = await api.activate(props.plugin.id, { version: previous.version, expectedActive: props.plugin.active.version })
    emit("changed")
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl" :show-close-button="!busy" @escape-key-down="keepOpen" @interact-outside="keepOpen">
      <DialogHeader>
        <DialogTitle>{{ outcome ? "Rolled back" : `Roll back ${plugin.name} to ${plugin.previous?.version}` }}</DialogTitle>
        <DialogDescription v-if="!outcome">
          {{ plugin.active.version }} stays installed, so you can switch forward again the same way.
        </DialogDescription>
      </DialogHeader>
      <InstallResult v-if="outcome" :outcome="outcome" />
      <UpdateImpactList v-else-if="impact" :impact="impact" />
      <p v-else-if="!error" class="text-sm text-muted-foreground">Checking what changes…</p>
      <Alert v-if="error" variant="destructive"><AlertDescription>{{ error }}</AlertDescription></Alert>
      <div class="flex justify-end gap-2">
        <Button v-if="outcome" @click="open = false">Close</Button>
        <template v-else>
          <Button variant="outline" :disabled="busy" @click="open = false">Cancel</Button>
          <Button :disabled="busy || !impact" @click="rollback">{{ busy ? "Rolling back…" : "Roll back" }}</Button>
        </template>
      </div>
    </DialogContent>
  </Dialog>
</template>
