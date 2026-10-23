<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { LoxoneSignalDto, LoxoneSignalInput } from "@lox-nexus/api"
import { Plus, Trash2 } from "@lucide/vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DataTypes } from "../lib/DataTypes.ts"
import { Selection } from "../lib/Selection.ts"
import { TextFilter } from "../lib/TextFilter.ts"
import type { LiveValues } from "../stores/LiveValues.ts"
import ListToolbar from "./data/ListToolbar.vue"
import VirtualTable from "./data/VirtualTable.vue"
import SignalForm from "./SignalForm.vue"
import ValueText from "./ValueText.vue"

/** The configured signals of a Miniserver with live values; searchable, filterable and bulk-deletable, for hundreds of signals. */
const props = defineProps<{
  signals: LoxoneSignalDto[]
  live: LiveValues
  add: (input: LoxoneSignalInput) => Promise<void>
  remove: (signals: LoxoneSignalDto[], progress: (done: number) => void) => Promise<void>
}>()
const adding = ref(false)
const query = ref("")
const direction = ref<"all" | "in" | "out">("all")
const selection = new Selection()
const progress = ref<string>()

const visible = computed(() => {
  const filter = new TextFilter(query.value)
  return props.signals.filter(s => (direction.value === "all" || s.direction === direction.value) && filter.matches(s.label, s.packetId, s.topic))
})
const visibleIds = computed(() => visible.value.map(s => s.id))
watch(() => props.signals, signals => selection.retain(signals.map(s => s.id)))

async function onAdd(input: LoxoneSignalInput) {
  await props.add(input)
  adding.value = false
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
        <Button v-if="selection.size" size="sm" variant="destructive" class="h-8" :disabled="!!progress" @click="removeSelected">
          <Trash2 class="size-4" /> {{ progress ?? `Delete ${selection.pick(visibleIds).length}` }}
        </Button>
      </ListToolbar>
      <VirtualTable
        :rows="visible" :row-key="s => s.id" columns="1.25rem minmax(8rem,1.4fr) minmax(7rem,1fr) 8rem minmax(10rem,2fr) minmax(7rem,1fr) 2rem"
        :empty="signals.length ? 'No signal matches.' : 'No signals. Add one, or adopt a discovered packet below.'"
      >
        <template #header>
          <Checkbox :model-value="selection.stateOf(visibleIds)" aria-label="Select all shown" @update:model-value="selection.toggleAll(visibleIds)" />
          <span>Name</span><span>Packet</span><span>Type</span><span>Topic</span><span>Value</span><span></span>
        </template>
        <template #row="{ row }">
          <Checkbox :model-value="selection.has(row.id)" :aria-label="`Select ${row.label}`" @update:model-value="v => selection.toggle(row.id, v === true)" />
          <span class="truncate font-medium" :title="row.label">{{ row.label }}</span>
          <span class="flex min-w-0 items-center gap-1.5"><Badge variant="outline">{{ row.direction }}</Badge><span class="truncate font-mono text-xs">{{ row.packetId }}</span></span>
          <span class="truncate text-muted-foreground">{{ DataTypes.nameOf(row.dataType) }}</span>
          <span class="truncate font-mono text-xs" :title="row.topic">{{ row.topic }}</span>
          <span class="truncate"><ValueText :value="live.get(row.topic)?.value" /></span>
          <Button size="icon" variant="ghost" class="size-7" title="Delete" :disabled="!!progress" @click="removeOne(row)"><Trash2 class="size-4" /></Button>
        </template>
      </VirtualTable>
    </CardContent>
    <Dialog v-model:open="adding">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader><DialogTitle>Add signal</DialogTitle></DialogHeader>
        <SignalForm :submit="onAdd" />
      </DialogContent>
    </Dialog>
  </Card>
</template>
