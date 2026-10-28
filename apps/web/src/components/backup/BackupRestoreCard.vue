<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"
import type { RestoreStatusDto } from "@lox-nexus/api"
import { ArchiveRestore } from "@lucide/vue"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AppContext } from "../../AppContext.ts"
import FormField from "../FormField.vue"

/**
 * Restores a backup in two steps: upload and check it (nothing changes yet), then restore, which
 * restarts Nexus with the backup's files; the current ones are kept in a folder in the data directory.
 */
const context = AppContext.use()
const file = ref<File>()
const passphrase = ref("")
const status = ref<RestoreStatusDto>()
const busy = ref<string>()
const failure = ref<string>()

async function attempt(label: string, work: () => Promise<unknown>) {
  busy.value = label
  failure.value = undefined
  try {
    await work()
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = undefined
  }
}

const load = () => attempt("Loading…", async () => (status.value = await context.backup.status()))
const check = () => attempt("Uploading and checking…", async () => {
  await context.backup.stage(file.value!, passphrase.value)
  passphrase.value = ""
  status.value = await context.backup.status()
})
const discard = () => attempt("Discarding…", async () => {
  await context.backup.discard()
  status.value = await context.backup.status()
})
let left = false
onUnmounted(() => (left = true))

// Nexus is gone for a moment; then the page loads again from the restored installation
const restore = () => attempt("Restarting…", async () => {
  if (!confirm("Replace this installation with the backup? Users and passwords become those of the backup. Nexus restarts; the current files are kept in the data directory.")) return
  const { restarting } = await context.backup.apply()
  if (!restarting) return void (status.value = await context.backup.status())
  for (let i = 0; i < 120 && !left; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    if (await fetch("/api/health").then(r => r.ok, () => false)) return window.location.reload()
  }
  if (!left) throw new Error("Nexus didn't come back within two minutes; check the server log.")
})

onMounted(load)
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Restore a backup</CardTitle>
      <CardDescription>Replaces everything here with the backup's state. The backup is checked first; nothing changes until you restore it.</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
      <template v-if="status?.pending">
        <Alert>
          <AlertTitle>Ready to restore</AlertTitle>
          <AlertDescription>
            Made {{ new Date(status.pending.manifest.createdAt).toLocaleString() }} by Nexus {{ status.pending.manifest.version }} ·
            {{ status.pending.manifest.history ? "with" : "without" }} value history · {{ status.pending.manifest.plugins.length }} installed plugins
          </AlertDescription>
        </Alert>
        <div class="flex flex-wrap items-center gap-2">
          <span v-if="status.pending.applying" class="text-sm">Restored at the next start of Nexus.</span>
          <Button v-else variant="destructive" :disabled="!!busy" @click="restore">
            <ArchiveRestore class="size-4" /> {{ status.canRestart ? "Restore and restart" : "Restore at the next start" }}
          </Button>
          <Button variant="outline" :disabled="!!busy" @click="discard">Discard</Button>
        </div>
      </template>
      <form v-else class="grid gap-4 sm:grid-cols-2" @submit.prevent="check">
        <FormField id="restoreFile" label="Backup file">
          <Input id="restoreFile" type="file" accept=".nxbackup" required @change="(e: Event) => (file = (e.target as HTMLInputElement).files?.[0])" />
        </FormField>
        <FormField id="restorePassphrase" label="Passphrase">
          <Input id="restorePassphrase" v-model="passphrase" type="password" autocomplete="off" required minlength="8" />
        </FormField>
        <div class="sm:col-span-2"><Button type="submit" :disabled="!!busy || !file">Check backup</Button></div>
      </form>
      <p v-if="busy" class="text-sm text-muted-foreground" role="status">{{ busy }}</p>
    </CardContent>
  </Card>
</template>
