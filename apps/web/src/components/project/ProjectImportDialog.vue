<script setup lang="ts">
import { ref, watch } from "vue"
import type { LoxoneProjectDto, LoxoneSignalDto, MiniserverDto } from "@lox-nexus/api"
import { FileDown, FileUp } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AppContext } from "../../AppContext.ts"
import FormField from "../FormField.vue"
import ProjectPeerImport from "./ProjectPeerImport.vue"

/**
 * Reads a Loxone Config project, either the Miniserver's current one over FTP or a file the user
 * picks (the .Loxone saved by Loxone Config, or a Miniserver archive), and offers its
 * intercommunication objects for import. The FTP login is sent once and not stored, the file is
 * read by the server and not kept. Emits `changed` after an import.
 */
const props = defineProps<{ ms: MiniserverDto; signals: LoxoneSignalDto[] }>()
const emit = defineEmits<{ changed: [] }>()
const open = defineModel<boolean>("open", { required: true })
const api = AppContext.use().miniservers

const source = ref<"miniserver" | "file">("miniserver")
const username = ref("")
const password = ref("")
const file = ref<File>()
const busy = ref(false)
const error = ref("")
const project = ref<LoxoneProjectDto>()

/** the server's cap (MiniserverFtp.MAX_BYTES); checked here so a large file isn't uploaded in vain */
const MAX_BYTES = 32 * 1_048_576

// closing forgets the login, the file and the project; nothing of it outlives the dialog
watch(open, isOpen => {
  if (isOpen) return
  password.value = ""
  project.value = undefined
  error.value = ""
})
// the file input is recreated with each tab and after "Read again", so the picked file goes too
watch([source, project, open], () => {
  file.value = undefined
  error.value = ""
})

async function read(work: () => Promise<LoxoneProjectDto>) {
  busy.value = true
  error.value = ""
  try {
    project.value = await work()
    password.value = ""
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  } finally {
    busy.value = false
  }
}

const readMiniserver = () => read(() => api.readProject(props.ms.id, { username: username.value, password: password.value }))
function readFile() {
  const picked = file.value
  if (!picked) return
  if (picked.size > MAX_BYTES) return void (error.value = `"${picked.name}" is larger than 32 MB; a project file is far smaller`)
  return read(() => api.readProjectFile(props.ms.id, picked))
}
const pick = (event: Event) => (file.value = (event.target as HTMLInputElement).files?.[0])
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>Import from Loxone Config</DialogTitle>
        <DialogDescription v-if="!project">
          Reads the intercommunication objects of a Loxone Config project: the one stored on {{ ms.host }}, or a project file you have.
        </DialogDescription>
        <DialogDescription v-else>
          {{ project.title }} · {{ project.file }}<template v-if="project.savedAt"> · saved {{ project.savedAt }}</template>
          <Button variant="link" size="sm" class="h-auto p-0 pl-2" @click="project = undefined">Read again</Button>
        </DialogDescription>
      </DialogHeader>
      <Tabs v-if="!project" v-model="source">
        <TabsList>
          <TabsTrigger value="miniserver">From the Miniserver</TabsTrigger>
          <TabsTrigger value="file">From a file</TabsTrigger>
        </TabsList>
        <TabsContent value="miniserver">
          <form class="grid gap-4 pt-2" @submit.prevent="readMiniserver">
            <p class="text-sm text-muted-foreground">Over FTP. The user needs the FTP right in Loxone Config; the login is used once and not stored.</p>
            <div class="grid grid-cols-2 gap-4">
              <FormField id="ftpUser" label="Miniserver user"><Input id="ftpUser" v-model="username" autocomplete="off" required /></FormField>
              <FormField id="ftpPassword" label="Password"><Input id="ftpPassword" v-model="password" type="password" autocomplete="off" required /></FormField>
            </div>
            <Button type="submit" :disabled="busy"><FileDown class="size-4" /> {{ busy ? "Reading project…" : "Read project" }}</Button>
          </form>
        </TabsContent>
        <TabsContent value="file">
          <form class="grid gap-4 pt-2" @submit.prevent="readFile">
            <FormField
              id="projectFile" label="Project file"
              hint="The .Loxone file Loxone Config saves, or a Miniserver archive (sps_….zip from /prog) or .LoxCC. It is read once and not kept."
            >
              <Input id="projectFile" type="file" accept=".Loxone,.loxone,.zip,.LoxCC,.loxcc" required @change="pick" />
            </FormField>
            <Button type="submit" :disabled="busy || !file"><FileUp class="size-4" /> {{ busy ? "Reading file…" : "Read file" }}</Button>
          </form>
        </TabsContent>
        <Alert v-if="error" variant="destructive" class="mt-4"><AlertDescription>{{ error }}</AlertDescription></Alert>
      </Tabs>
      <ProjectPeerImport v-else :project="project" :ms="ms" :signals="signals" @changed="emit('changed')" />
    </DialogContent>
  </Dialog>
</template>
