<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { BatchOutcomeDto, BatchReviewDto } from "@lox-nexus/api"
import { CircleAlert, CircleCheck, RefreshCw } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppContext } from "../../../AppContext.ts"
import UpdateImpactList from "./UpdateImpactList.vue"

/**
 * Updates plugins from the local repository in one go: one review of what changes for each (its
 * instances restart, capabilities it drops), one button, one result per plugin. There is no source
 * step and no trust question: the repository is a server folder only its administrator controls,
 * and each plugin was trusted when it was first installed from it. A rollback stays on each
 * plugin's card.
 */
const props = defineProps<{ ids: string[] }>()
const open = defineModel<boolean>("open", { required: true })
const emit = defineEmits<{ changed: [] }>()
const api = AppContext.use().pluginPackages

const review = ref<BatchReviewDto>()
const outcome = ref<BatchOutcomeDto>()
const busy = ref(false)
const error = ref("")
const ready = computed(() => review.value?.items.filter(item => !item.problem) ?? [])
// a failed confirmation (review expired, other updates running) leaves the review unusable: check again
const stale = ref(false)

watch(open, isOpen => isOpen && check(), { immediate: true })

async function check() {
  ;[review.value, outcome.value, error.value, stale.value] = [undefined, undefined, "", false]
  await run(async () => (review.value = await api.reviewBatch(props.ids)))
}

async function confirm() {
  const batchId = review.value?.batchId
  if (!batchId) return
  error.value = ""
  await run(async () => {
    outcome.value = await api.confirmBatch(batchId)
    emit("changed")
  }, () => (stale.value = true))
}

// a click or focus outside, or Escape, would close it mid-install and lose the results
function keepOpen(event: Event) {
  if (busy.value) event.preventDefault()
}

async function run(work: () => Promise<unknown>, failed?: () => void) {
  busy.value = true
  try {
    await work()
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
    failed?.()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-2xl" :show-close-button="!busy" @escape-key-down="keepOpen" @interact-outside="keepOpen">
      <DialogHeader>
        <DialogTitle>{{ ids.length === 1 ? "Update plugin" : "Update plugins" }}</DialogTitle>
        <DialogDescription>From the server's local plugin repository.</DialogDescription>
      </DialogHeader>
      <Alert v-if="error" variant="destructive"><AlertDescription>{{ error }}</AlertDescription></Alert>
      <p v-if="!review && busy" class="text-sm text-muted-foreground">Checking {{ ids.length === 1 ? "the update" : `${ids.length} updates` }}…</p>
      <div v-else-if="outcome" class="grid gap-2 text-sm">
        <p v-for="item in outcome.items" :key="item.id" class="flex items-start gap-2">
          <CircleCheck v-if="item.ok" class="size-4 shrink-0 text-emerald-600" />
          <CircleAlert v-else class="size-4 shrink-0 text-destructive" />
          <span><span class="font-medium">{{ item.name }}</span> {{ item.ok ? `is now ${item.version}` : `was not updated: ${item.error}` }}</span>
        </p>
        <p class="text-xs text-muted-foreground">Each plugin can be rolled back on its card.</p>
      </div>
      <div v-else-if="review" class="grid gap-4">
        <section v-for="item in review.items" :key="item.id" class="grid gap-2 rounded-md border p-3">
          <p class="flex flex-wrap items-baseline gap-2 text-sm">
            <span class="font-medium">{{ item.name }}</span>
            <span class="font-mono text-xs">{{ item.from }} → {{ item.to ?? "–" }}</span>
          </p>
          <p v-if="item.problem" class="text-sm text-destructive">Can't be updated: {{ item.problem }}</p>
          <UpdateImpactList v-else-if="item.impact" :impact="item.impact" />
        </section>
      </div>
      <div class="flex justify-end gap-2">
        <Button variant="outline" :disabled="busy" @click="open = false">{{ outcome ? "Close" : "Cancel" }}</Button>
        <Button v-if="stale" :disabled="busy" @click="check">Check again</Button>
        <Button v-else-if="!outcome && ready.length && review?.batchId" :disabled="busy" @click="confirm">
          <RefreshCw class="size-4" :class="busy && 'animate-spin'" /> {{ ready.length === 1 ? `Update ${ready[0]!.name}` : `Update ${ready.length} plugins` }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
