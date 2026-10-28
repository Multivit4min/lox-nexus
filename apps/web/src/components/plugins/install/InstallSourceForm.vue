<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { RepositoryPluginDto, StagedInstallDto } from "@lox-nexus/api"
import { Download } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AppContext } from "../../../AppContext.ts"
import type { InstallSource } from "../../../lib/InstallSource.ts"
import FormField from "../../FormField.vue"
import TrustWarning from "./TrustWarning.vue"

/**
 * Step 1 of an install: the source (git, a ZIP upload, or the server's local plugin repository),
 * the trust warning, and "Fetch and check", which only works after "I trust this source". Emits
 * the staged install the server answers with.
 */
const props = defineProps<{ initial?: InstallSource; repository: RepositoryPluginDto[] }>()
const emit = defineEmits<{ staged: [install: StagedInstallDto]; busy: [busy: boolean] }>()
const api = AppContext.use().pluginPackages

/** the server's cap (InstallLimits.uploadBytes); checked here so a large file isn't uploaded in vain */
const MAX_ZIP_BYTES = 50 * 1_048_576

const kind = ref<InstallSource["kind"]>(props.initial?.kind ?? (props.repository.length ? "local" : "git"))
const url = ref(props.initial?.url ?? "")
const gitRef = ref(props.initial?.ref ?? "main")
const folder = ref(props.initial?.folder ?? props.repository.find(plugin => !plugin.problem)?.folder ?? "")
const file = ref<File>()
const trusted = ref(false)
const busy = ref(false)
const error = ref("")

// trust is given to one source: picking another one asks again
watch([kind, url, gitRef, folder, file], () => (trusted.value = false))
watch(busy, value => emit("busy", value))

const installable = computed(() => props.repository.filter(plugin => !plugin.problem))
const ready = computed(() => trusted.value && !busy.value && (
  kind.value === "git" ? url.value.trim() !== "" && gitRef.value.trim() !== "" : kind.value === "zip" ? file.value !== undefined : folder.value !== ""
))
const pick = (event: Event) => (file.value = (event.target as HTMLInputElement).files?.[0])
const label = (plugin: RepositoryPluginDto) =>
  `${plugin.name ?? plugin.folder} ${plugin.version ?? ""}${plugin.installedVersion ? ` (installed: ${plugin.installedVersion})` : ""}`

async function fetchAndCheck() {
  if (!ready.value) return
  if (kind.value === "zip" && file.value && file.value.size > MAX_ZIP_BYTES) return void (error.value = "The archive is larger than 50 MB")
  busy.value = true
  error.value = ""
  try {
    if (kind.value === "git") emit("staged", await api.stageGit({ url: url.value.trim(), ref: gitRef.value.trim() }))
    else if (kind.value === "zip") emit("staged", await api.stageZip(file.value!))
    else emit("staged", await api.stageLocal(folder.value))
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="grid gap-4" @submit.prevent="fetchAndCheck">
    <TrustWarning />
    <!-- tabs stay mounted, so a picked ZIP is still shown after looking at another tab -->
    <Tabs v-model="kind" :unmount-on-hide="false">
      <TabsList>
        <TabsTrigger value="local">Local repository</TabsTrigger>
        <TabsTrigger value="git">Git</TabsTrigger>
        <TabsTrigger value="zip">ZIP file</TabsTrigger>
      </TabsList>
      <TabsContent value="local" class="pt-2">
        <FormField id="installFolder" label="Plugin" hint="Built plugins in the server's local plugin repository folder.">
          <Select v-model="folder" :disabled="!installable.length">
            <SelectTrigger id="installFolder" class="w-full"><SelectValue :placeholder="installable.length ? 'Pick a plugin' : 'No built plugin found'" /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="plugin in installable" :key="plugin.folder" :value="plugin.folder">{{ label(plugin) }}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <ul v-if="repository.length > installable.length" class="mt-2 grid gap-0.5 text-xs text-muted-foreground">
          <li v-for="plugin in repository.filter(p => p.problem)" :key="plugin.folder">{{ plugin.name ?? plugin.folder }}: {{ plugin.problem }}</li>
        </ul>
      </TabsContent>
      <TabsContent value="git" class="grid gap-4 pt-2 sm:grid-cols-[1fr_12rem]">
        <FormField id="installUrl" label="Repository URL" hint="https only; the built bundle must be committed.">
          <Input id="installUrl" v-model="url" placeholder="https://github.com/owner/plugin.git" autocomplete="off" />
        </FormField>
        <FormField id="installRef" label="Branch or tag"><Input id="installRef" v-model="gitRef" autocomplete="off" /></FormField>
      </TabsContent>
      <TabsContent value="zip" class="pt-2">
        <FormField id="installZip" label="Plugin archive" hint="A release ZIP with package.json and the built bundle, up to 50 MB.">
          <Input id="installZip" type="file" accept=".zip,application/zip" @change="pick" />
        </FormField>
      </TabsContent>
    </Tabs>
    <div class="flex items-center gap-2">
      <Checkbox id="installTrust" v-model="trusted" />
      <Label for="installTrust">I trust this source</Label>
    </div>
    <Alert v-if="error" variant="destructive"><AlertDescription>{{ error }}</AlertDescription></Alert>
    <Button type="submit" :disabled="!ready"><Download class="size-4" /> {{ busy ? "Fetching and checking…" : "Fetch and check" }}</Button>
  </form>
</template>
