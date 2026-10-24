<script setup lang="ts">
import { ref, watch } from "vue"
import type { LoxoneProjectDto, LoxoneSignalDto, MiniserverDto } from "@lox-nexus/api"
import { FileDown } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { AppContext } from "../../AppContext.ts"
import FormField from "../FormField.vue"
import ProjectPeerImport from "./ProjectPeerImport.vue"

/**
 * Reads the Miniserver's current Loxone Config project over FTP and offers its intercommunication
 * objects for import. The FTP login is sent once and not stored. Emits `changed` after an import.
 */
const props = defineProps<{ ms: MiniserverDto; signals: LoxoneSignalDto[] }>()
const emit = defineEmits<{ changed: [] }>()
const open = defineModel<boolean>("open", { required: true })
const api = AppContext.use().miniservers

const username = ref("")
const password = ref("")
const busy = ref(false)
const error = ref("")
const project = ref<LoxoneProjectDto>()

// closing forgets the login and the project; nothing of it outlives the dialog
watch(open, isOpen => {
  if (isOpen) return
  password.value = ""
  project.value = undefined
  error.value = ""
})

async function read() {
  busy.value = true
  error.value = ""
  try {
    project.value = await api.readProject(props.ms.id, { username: username.value, password: password.value })
    password.value = ""
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>Import from Loxone Config</DialogTitle>
        <DialogDescription v-if="!project">
          Reads the project stored on {{ ms.host }} over FTP. The user needs the FTP right in Loxone Config; the login is used once and not stored.
        </DialogDescription>
        <DialogDescription v-else>
          {{ project.title }} · {{ project.file }}<template v-if="project.savedAt"> · saved {{ project.savedAt }}</template>
          <Button variant="link" size="sm" class="h-auto p-0 pl-2" @click="project = undefined">Read again</Button>
        </DialogDescription>
      </DialogHeader>
      <form v-if="!project" class="grid gap-4" @submit.prevent="read">
        <div class="grid grid-cols-2 gap-4">
          <FormField id="ftpUser" label="Miniserver user"><Input id="ftpUser" v-model="username" autocomplete="off" required /></FormField>
          <FormField id="ftpPassword" label="Password"><Input id="ftpPassword" v-model="password" type="password" autocomplete="off" required /></FormField>
        </div>
        <Alert v-if="error" variant="destructive"><AlertDescription>{{ error }}</AlertDescription></Alert>
        <Button type="submit" :disabled="busy"><FileDown class="size-4" /> {{ busy ? "Reading project…" : "Read project" }}</Button>
      </form>
      <ProjectPeerImport v-else :project="project" :ms="ms" :signals="signals" @changed="emit('changed')" />
    </DialogContent>
  </Dialog>
</template>
