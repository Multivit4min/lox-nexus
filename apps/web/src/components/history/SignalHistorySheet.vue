<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue"
import type { HistorySeriesDto } from "@lox-nexus/api"
import { RefreshCw, Trash2 } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { AppContext } from "../../AppContext.ts"
import { Throttle } from "../../lib/Throttle.ts"
import type { LiveValues } from "../../stores/LiveValues.ts"
import SignalHistoryChart from "./SignalHistoryChart.vue"
import SignalHistoryTable from "./SignalHistoryTable.vue"

/** The signal whose history is shown. */
export interface HistorySubject {
  id: string
  label: string
  /** with the view's live values, a 1-hour chart follows the signal's changes */
  topic?: string
}

const RANGES = [
  { label: "1 h", ms: 60 * 60_000 },
  { label: "24 h", ms: 24 * 60 * 60_000 },
  { label: "7 days", ms: 7 * 24 * 60 * 60_000 },
  { label: "30 days", ms: 30 * 24 * 60 * 60_000 },
  { label: "1 year", ms: 365 * 24 * 60 * 60_000 }
] as const

/**
 * A signal's recorded values over a chosen range, as a chart or a table (text values only as a
 * table). The server picks the resolution. The switch records the signal or stops recording it;
 * "Delete history" removes what is stored. The 1-hour range stays current: it loads again when
 * the signal changes (at most every 2 s) and every 30 s, so the right edge moves along.
 */
const subject = defineModel<HistorySubject | undefined>("subject", { required: true })
const props = defineProps<{ live?: LiveValues }>()
const { history, recorded } = AppContext.use()
const range = ref<number>(RANGES[1].ms)
const view = ref<"chart" | "table">("chart")
const series = ref<HistorySeriesDto>()
const now = ref(Date.now())
const failure = ref<string>()
const loading = ref(false)
const enabled = ref(true)
/** only the latest request's answer (or error) applies; quick range clicks must not show an older range */
let requests = 0
const open = computed({ get: () => !!subject.value, set: value => !value && (subject.value = undefined) })
const isText = computed(() => series.value?.valueType === "string")
const resolution = computed(() => {
  const current = series.value
  if (!current || current.resolution === "raw") return "every change"
  const minutes = current.width / 60_000
  return minutes < 60 ? `${minutes}-minute averages` : minutes === 60 ? "hourly averages" : `averages over ${minutes / 60} hours`
})
const report = (error: unknown) => (failure.value = error instanceof Error ? error.message : String(error))

async function load() {
  const target = subject.value
  if (!target) return
  const request = ++requests
  loading.value = true
  failure.value = undefined
  now.value = Date.now()
  try {
    const result = await history.series(target.id, now.value - range.value, now.value)
    if (request === requests) series.value = result
  } catch (error) {
    if (request === requests) report(error)
  } finally {
    if (request === requests) loading.value = false
  }
}

watch([subject, range], (values, old) => {
  const [current, previous] = [values[0], old?.[0]]
  if (!current) return
  series.value = undefined
  load()
  // a new signal: what is recorded may have changed elsewhere meanwhile
  if (current.id !== previous?.id) {
    void recorded.load()
    history.settings().then(settings => (enabled.value = settings.enabled), () => {})
  }
}, { immediate: true })

const following = () => open.value && range.value === RANGES[0].ms
const reload = new Throttle(2000, () => following() && void load())
const tick = setInterval(() => following() && reload.request(), 30_000)
watch(() => (subject.value?.topic ? props.live?.get(subject.value.topic)?.ts : undefined), ts => ts !== undefined && following() && reload.request())
onUnmounted(() => {
  clearInterval(tick)
  reload.cancel()
})

const record = (on: boolean) => recorded.set([subject.value!.id], on).catch(report)

async function purge() {
  if (!confirm(`Delete the stored history of "${subject.value?.label}"? It is recorded again from its next value if recording is on.`)) return
  try {
    await history.purge(subject.value!.id)
    await load()
  } catch (error) {
    report(error)
  }
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent class="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
      <SheetHeader>
        <SheetTitle>History of {{ subject?.label }}</SheetTitle>
        <SheetDescription>{{ series ? `Showing ${resolution}.` : "Loading…" }}{{ series?.gaps.length ? " Grey areas: nothing was recorded (Nexus wasn't running, or recording was off)." : "" }}</SheetDescription>
      </SheetHeader>
      <div v-if="subject" class="grid gap-4 px-4 pb-4">
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex flex-wrap gap-1" role="group" aria-label="Range">
            <Button v-for="r in RANGES" :key="r.ms" size="sm" class="h-8" :variant="range === r.ms ? 'secondary' : 'ghost'" :aria-pressed="range === r.ms" @click="range = r.ms">{{ r.label }}</Button>
          </div>
          <Button size="icon" variant="ghost" class="size-8" title="Load again" :disabled="loading" @click="load"><RefreshCw class="size-4" /></Button>
          <div v-if="!isText" class="ml-auto flex gap-1 text-xs">
            <button
              v-for="option in (['chart', 'table'] as const)" :key="option" type="button" class="rounded px-2 py-0.5" :aria-pressed="view === option"
              :class="view === option ? 'bg-secondary' : 'text-muted-foreground hover:bg-accent'" @click="view = option"
            >
              {{ option }}
            </button>
          </div>
        </div>
        <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
        <p v-if="series && series.points.length === 0 && !series.before" class="text-sm text-muted-foreground">
          Nothing recorded in this range{{ recorded.has(subject.id) ? "" : ". Switch on recording below" }}.
        </p>
        <template v-else-if="series">
          <SignalHistoryChart v-if="view === 'chart' && !isText" :series="series" :now="now" />
          <SignalHistoryTable v-else :series="series" />
          <p v-if="series.resolution === 'raw' && series.truncated" class="text-xs text-muted-foreground">More changes than can be shown; pick a shorter range for the newest ones.</p>
        </template>
        <p v-if="!enabled" class="text-sm text-muted-foreground">Recording is switched off on the History page; nothing new is recorded.</p>
        <div class="flex flex-wrap items-center gap-3 border-t pt-3">
          <label class="flex items-center gap-2 text-sm"><Switch :model-value="recorded.has(subject.id)" @update:model-value="v => record(v)" /> Record this signal</label>
          <Button size="sm" variant="ghost" class="ml-auto text-destructive" @click="purge"><Trash2 class="size-4" /> Delete history</Button>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
