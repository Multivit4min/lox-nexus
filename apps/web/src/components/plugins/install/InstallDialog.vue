<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { InstallOutcomeDto, RepositoryPluginDto, StagedInstallDto } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ApiError } from "../../../api/ApiError.ts"
import { AppContext } from "../../../AppContext.ts"
import type { InstallSource } from "../../../lib/InstallSource.ts"
import InstallResult from "./InstallResult.vue"
import InstallReview from "./InstallReview.vue"
import InstallSourceForm from "./InstallSourceForm.vue"

/**
 * Install or update a plugin in three steps: source (with the trust warning), review (exact
 * source, hashes, impact on instances), result (each instance's state). Closing before confirming
 * discards the staged files on the server; while a request runs the dialog can't be closed, so a
 * late answer never lands in a closed or reopened dialog. Emits `changed` after an install.
 */
const props = defineProps<{ initial?: InstallSource; repository: RepositoryPluginDto[] }>()
const emit = defineEmits<{ changed: [] }>()
const open = defineModel<boolean>("open", { required: true })
const api = AppContext.use().pluginPackages

const staged = ref<StagedInstallDto>()
const outcome = ref<InstallOutcomeDto>()
const fetching = ref(false)
const busy = ref(false)
const error = ref("")
/** the server dropped the staged install (changed meanwhile, or expired): only checking again helps */
const stale = ref(false)
const locked = computed(() => fetching.value || busy.value)
const title = computed(() => outcome.value ? "Installed" : staged.value ? "Review and install" : props.initial?.update ? "Update plugin" : "Install plugin")

// a fresh start on every open, and nothing left staged on the server after closing
watch(open, isOpen => {
  if (!isOpen && staged.value && !outcome.value) void api.discard(staged.value.stagingId).catch(() => undefined)
  staged.value = undefined
  outcome.value = undefined
  error.value = ""
  stale.value = false
})

const keepOpen = (event: Event) => locked.value && event.preventDefault()

function back() {
  if (staged.value && !stale.value) void api.discard(staged.value.stagingId).catch(() => undefined)
  staged.value = undefined
  error.value = ""
  stale.value = false
}

async function confirm() {
  if (!staged.value) return
  busy.value = true
  error.value = ""
  try {
    outcome.value = await api.confirm(staged.value.stagingId, staged.value.installedVersion ?? null)
    emit("changed")
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
    stale.value = failure instanceof ApiError && (failure.status === 404 || failure.status === 409)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-3xl" :show-close-button="!locked" @escape-key-down="keepOpen" @interact-outside="keepOpen">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="!staged">Fetching checks the package and asks the plugin what it offers.</DialogDescription>
      </DialogHeader>
      <!-- kept while reviewing, so Back returns to what was entered -->
      <InstallSourceForm v-show="!staged" :initial="props.initial" :repository="repository" @busy="value => (fetching = value)" @staged="install => (staged = install)" />
      <template v-if="staged && !outcome">
        <InstallReview :staged="staged" />
        <Alert v-if="error" variant="destructive"><AlertDescription>{{ error }}</AlertDescription></Alert>
        <div class="flex justify-end gap-2">
          <Button variant="outline" :disabled="busy" @click="back">Back</Button>
          <Button v-if="stale" @click="back">Check again</Button>
          <Button v-else :disabled="busy" @click="confirm">{{ busy ? "Installing…" : staged.sameAsInstalled ? "Install again" : "Install" }}</Button>
        </div>
      </template>
      <template v-if="outcome">
        <InstallResult :outcome="outcome" />
        <div class="flex justify-end"><Button @click="open = false">Close</Button></div>
      </template>
    </DialogContent>
  </Dialog>
</template>
