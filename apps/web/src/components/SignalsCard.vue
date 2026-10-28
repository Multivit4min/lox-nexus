<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import type { LoxoneSignalDto, LoxoneSignalInput, SignalLoadDto } from "@lox-nexus/api"
import { Lock, Plus, Trash2 } from "@lucide/vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppContext } from "../AppContext.ts"
import { ApiError } from "../api/ApiError.ts"
import { DataTypes } from "../lib/DataTypes.ts"
import { LoadShare } from "../lib/LoadShare.ts"
import { Selection } from "../lib/Selection.ts"
import { TextFilter } from "../lib/TextFilter.ts"
import type { LiveValues } from "../stores/LiveValues.ts"
import ListToolbar from "./data/ListToolbar.vue"
import ForceDialog from "./inspector/ForceDialog.vue"
import SignalActions from "./SignalActions.vue"
import VirtualTable from "./data/VirtualTable.vue"
import SignalForm from "./SignalForm.vue"
import RecordButtons from "./history/RecordButtons.vue"
import SignalHistorySheet, { type HistorySubject } from "./history/SignalHistorySheet.vue"
import ValueText from "./ValueText.vue"

/**
 * The configured signals of a Miniserver with live values; searchable, filterable and
 * bulk-deletable, for hundreds of signals. Each row can be edited, forced and released; a release
 * goes back to the last value received (or sent by a wire).
 */
const props = defineProps<{
  signals: LoxoneSignalDto[]
  live: LiveValues
  add: (input: LoxoneSignalInput) => Promise<void>
  update: (signal: LoxoneSignalDto, input: LoxoneSignalInput) => Promise<void>
  remove: (signals: LoxoneSignalDto[], progress: (done: number) => void) => Promise<void>
  /** each signal's share of the intercommunication limit in percent, by id */
  load?: SignalLoadDto
  /** the Miniserver's whole load in percent, to say how much of it the signals are */
  totalLoad?: number
}>()
const emit = defineEmits<{ wire: [signal: LoxoneSignalDto] }>()
const { bus, recorded } = AppContext.use()
const adding = ref(false)
const editing = ref<LoxoneSignalDto>()
const forcing = ref<LoxoneSignalDto>()
const forceOpen = ref(false)
const query = ref("")
const direction = ref<"all" | "in" | "out">("all")
const selection = new Selection()
const historyFor = ref<HistorySubject>()
onMounted(() => void recorded.load())
const progress = ref<string>()

const visible = computed(() => {
  const filter = new TextFilter(query.value)
  return props.signals.filter(s => (direction.value === "all" || s.direction === direction.value) && filter.matches(s.label, s.packetId, s.topic))
})
// the shares cover only signals; the rest of the total is explained in the header's load details.
// Both come from separate requests, a moment apart, so the signals may not exceed the total shown.
const signalsLoad = computed(() => Math.min(Object.values(props.load ?? {}).reduce((sum, share) => sum + share, 0), props.totalLoad ?? Infinity))
const visibleIds = computed(() => visible.value.map(s => s.id))
watch(() => props.signals, signals => {
  selection.retain(signals.map(s => s.id))
  // an edit or delete may have moved the topic the force dialog is about
  const target = forcing.value
  if (target && !signals.some(s => s.id === target.id && s.topic === target.topic)) {
    forceOpen.value = false
    forcing.value = undefined
  }
})

async function onAdd(input: LoxoneSignalInput) {
  await props.add(input)
  adding.value = false
}

async function onUpdate(input: LoxoneSignalInput) {
  await props.update(editing.value!, input)
  editing.value = undefined
}

const isForced = (signal: LoxoneSignalDto) => props.live.get(signal.topic)?.flags?.forced === true

function force(signal: LoxoneSignalDto) {
  forcing.value = signal
  forceOpen.value = true
}

async function release(signal: LoxoneSignalDto) {
  try {
    await bus.release(signal.topic)
  } catch (error) {
    alert(error instanceof ApiError ? error.message : String(error))
  }
}

async function removeOne(signal: LoxoneSignalDto) {
  if (confirm(`Delete "${signal.label}"? Wires using it are deleted too.`)) await props.remove([signal], () => {})
}

async function removeSelected() {
  const ids = new Set(selection.pick(visibleIds.value))
  const doomed = visible.value.filter(s => ids.has(s.id))
  if (!confirm(`Delete ${doomed.length} signal(s)? Wires using them are deleted too.`)) return
  try {
    await props.remove(doomed, done => (progress.value = `Deleting ${done}/${doomed.length}…`))
  } finally {
    progress.value = undefined
    selection.clear()
  }
}
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between">
      <CardTitle>Signals</CardTitle>
      <Button size="sm" variant="outline" @click="adding = true"><Plus class="size-4" /> Add signal</Button>
    </CardHeader>
    <CardContent class="space-y-3">
      <ListToolbar v-model="query" :shown="visible.length" :total="signals.length" placeholder="Search name, packet or topic">
        <div class="flex gap-1">
          <Button v-for="option in (['all', 'in', 'out'] as const)" :key="option" size="sm" class="h-8" :variant="direction === option ? 'secondary' : 'ghost'" @click="direction = option">{{ option }}</Button>
        </div>
        <RecordButtons v-if="selection.pick(visibleIds).length" :ids="selection.pick(visibleIds)" />
        <Button v-if="selection.size" size="sm" variant="destructive" class="h-8" :disabled="!!progress" @click="removeSelected">
          <Trash2 class="size-4" /> {{ progress ?? `Delete ${selection.pick(visibleIds).length}` }}
        </Button>
      </ListToolbar>
      <VirtualTable
        :rows="visible" :row-key="s => s.id" columns="1.25rem minmax(8rem,1.4fr) minmax(7rem,1fr) 8rem minmax(10rem,2fr) minmax(7rem,1fr) 4rem 9.5rem"
        :empty="signals.length ? 'No signal matches.' : 'No signals. Add one, or adopt a discovered packet below.'"
      >
        <template #header>
          <Checkbox :model-value="selection.stateOf(visibleIds)" aria-label="Select all shown" @update:model-value="selection.toggleAll(visibleIds)" />
          <span>Name</span><span>Packet</span><span>Type</span><span>Topic</span><span>Value</span>
          <span class="text-right" title="Share of Loxone's intercommunication limit (35 messages/s, 2-minute average), resends included">Load</span><span></span>
        </template>
        <template #row="{ row }">
          <Checkbox :model-value="selection.has(row.id)" :aria-label="`Select ${row.label}`" @update:model-value="v => selection.toggle(row.id, v === true)" />
          <span class="truncate font-medium" :title="row.label">{{ row.label }}</span>
          <span class="flex min-w-0 items-center gap-1.5"><Badge variant="outline">{{ row.direction }}</Badge><span class="truncate font-mono text-xs">{{ row.packetId }}</span></span>
          <span class="truncate text-muted-foreground">{{ DataTypes.nameOf(row.dataType) }}{{ row.lumitech ? " · Lumitech" : "" }}</span>
          <span class="truncate font-mono text-xs" :title="row.topic">{{ row.topic }}</span>
          <span class="flex min-w-0 items-center gap-1.5">
            <Lock v-if="isForced(row)" class="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-label="forced" />
            <span class="truncate"><ValueText :value="live.get(row.topic)?.value" /></span>
          </span>
          <span class="text-right text-xs text-muted-foreground tabular-nums">{{ LoadShare.format(load?.[row.id]) }}</span>
          <SignalActions
            :label="row.label" :forced="isForced(row)" :recorded="recorded.has(row.id)" :disabled="!!progress" wirable @history="historyFor = { id: row.id, label: row.label }"
            @edit="editing = row" @wire="emit('wire', row)" @force="force(row)" @release="release(row)" @remove="removeOne(row)"
          />
        </template>
      </VirtualTable>
      <p v-if="totalLoad" class="text-xs text-muted-foreground">
        Load of all signals together: {{ LoadShare.format(signalsLoad) }} of {{ LoadShare.format(totalLoad) }}.
        <template v-if="totalLoad - signalsLoad >= 0.1">The rest belongs to no signal; the load figure at the top shows what it is.</template>
      </p>
    </CardContent>
    <Dialog v-model:open="adding">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader><DialogTitle>Add signal</DialogTitle></DialogHeader>
        <SignalForm :submit="onAdd" />
      </DialogContent>
    </Dialog>
    <Dialog :open="!!editing" @update:open="open => !open && (editing = undefined)">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader><DialogTitle>Edit {{ editing?.label }}</DialogTitle></DialogHeader>
        <SignalForm v-if="editing" :key="editing.id" :initial="editing" :submit="onUpdate" />
      </DialogContent>
    </Dialog>
    <SignalHistorySheet v-model:subject="historyFor" />
    <ForceDialog
      v-if="forcing" v-model:open="forceOpen" :topic="forcing.topic"
      :current="live.get(forcing.topic)?.value" :value-type="forcing.valueType === 'any' ? undefined : forcing.valueType"
    />
  </Card>
</template>
