<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { Download } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { AppContext } from "../../AppContext.ts"
import { BackupApi } from "../../api/BackupApi.ts"
import FormField from "../FormField.vue"

/**
 * Makes a backup of the whole installation. A plain form posts it, into a hidden frame, so the
 * browser saves the file as it arrives (a large history doesn't pass through page memory); the
 * passphrase is checked here first, since the frame can't show an error.
 */
const { history } = AppContext.use()
const passphrase = ref("")
const repeat = ref("")
const withHistory = ref(false)
const historySize = ref<number>()
const started = ref(false)
const form = ref<HTMLFormElement>()
const tooShort = computed(() => (passphrase.value.length > 0 && passphrase.value.length < 8 ? "At least 8 characters" : undefined))
const differs = computed(() => (repeat.value && repeat.value !== passphrase.value ? "The passphrases differ" : undefined))
const failure = ref<string>()
const ready = computed(() => passphrase.value.length >= 8 && repeat.value === passphrase.value)

onMounted(() => history.stats().then(stats => (historySize.value = stats.fileBytes), () => {}))

function submit() {
  if (!ready.value) return
  failure.value = undefined
  form.value?.submit()
  started.value = true
}

// a download doesn't load the frame; an error answer (JSON) does, and is shown here
function loaded(event: Event) {
  const text = (event.target as HTMLIFrameElement).contentDocument?.body?.textContent?.trim()
  if (!text) return
  started.value = false
  try {
    failure.value = (JSON.parse(text) as { error?: string }).error ?? text
  } catch {
    failure.value = text.slice(0, 300)
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Make a backup</CardTitle>
      <CardDescription>
        Everything: Miniservers, plugins and their files, wires, forces, users, settings. Secrets are inside, so the whole file is encrypted
        with a passphrase. Without the passphrase, the backup can't be restored.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form ref="form" class="grid gap-4 sm:grid-cols-2" method="post" :action="BackupApi.CREATE_URL" target="backup-download" @submit.prevent="submit">
        <FormField id="backupPassphrase" label="Passphrase" :error="tooShort">
          <Input id="backupPassphrase" v-model="passphrase" name="passphrase" type="password" autocomplete="new-password" required />
        </FormField>
        <FormField id="backupRepeat" label="Passphrase again" :error="differs">
          <Input id="backupRepeat" v-model="repeat" type="password" autocomplete="new-password" required />
        </FormField>
        <label class="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox v-model="withHistory" />
          Include the value history{{ historySize ? ` (about ${Math.max(0.1, historySize / 1e6).toFixed(1)} MB before compression)` : "" }}
          <input v-if="withHistory" type="hidden" name="history" value="on" />
        </label>
        <div class="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" :disabled="!ready"><Download class="size-4" /> Download backup</Button>
          <span v-if="started" class="text-sm text-muted-foreground" role="status">Your browser saves the file once Nexus has prepared it; a large history takes a while.</span>
          <span v-if="failure" class="text-sm text-destructive" role="alert">{{ failure }}</span>
        </div>
      </form>
      <iframe name="backup-download" title="Backup download" class="hidden" @load="loaded"></iframe>
    </CardContent>
  </Card>
</template>
