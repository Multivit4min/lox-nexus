<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import type { PluginInstanceDto, PluginSignalDto, PluginSignalInput } from "@lox-nexus/api"
import type { CatalogEntry, PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { Cable, CircleAlert, FolderTree, Lock, Plus } from "@lucide/vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppContext } from "../../AppContext.ts"
import { ApiError } from "../../api/ApiError.ts"
import { BridgeDraft, type BridgeCandidate } from "../../lib/BridgeDraft.ts"
import type { CatalogRow } from "../../lib/CatalogTree.ts"
import { Selection } from "../../lib/Selection.ts"
import { TextFilter } from "../../lib/TextFilter.ts"
import type { LiveValues } from "../../stores/LiveValues.ts"
import ListToolbar from "../data/ListToolbar.vue"
import VirtualTable from "../data/VirtualTable.vue"
import ForceDialog from "../inspector/ForceDialog.vue"
import SignalActions from "../SignalActions.vue"
import RecordButtons from "../history/RecordButtons.vue"
import SignalHistorySheet, { type HistorySubject } from "../history/SignalHistorySheet.vue"
import ValueText from "../ValueText.vue"
import WiredMark from "../WiredMark.vue"
import BridgeDialog from "./BridgeDialog.vue"
import CatalogBrowser from "./CatalogBrowser.vue"
import PluginSignalDialog, { type SignalDialogTarget } from "./PluginSignalDialog.vue"

/**
 * The sensors and actuators of one plugin instance with live values. Rows can be edited, forced,
 * released and deleted; new ones come from the plugin's catalog or are added manually.
 * Selected signals, or catalog entries, can be connected to a Miniserver in one step.
 */
const props = defineProps<{ instance: PluginInstanceDto; description: PluginDescription; signals: PluginSignalDto[]; live: LiveValues }>()
const emit = defineEmits<{ changed: []; wire: [signal: PluginSignalDto] }>()
const { plugins: api, bus, recorded, wired } = AppContext.use()
const dialog = ref<SignalDialogTarget>()
const browsing = ref(false)
const forcing = ref<PluginSignalDto>()
const forceOpen = ref(false)
const query = ref("")
const selection = new Selection()
const historyFor = ref<HistorySubject>()
onMounted(() => void recorded.load())
// also after a deletion or connecting to a Miniserver: both change the signals and their wires
watch(() => props.signals, () => void wired.load(), { immediate: true })
const bridging = ref<BridgeCandidate[]>([])
const bridgeOpen = ref(false)

const visible = computed(() => {
  const filter = new TextFilter(query.value)
  return props.signals.filter(s => filter.matches(s.label, capabilityOf(s), s.capability, s.topic))
})
const visibleIds = computed(() => visible.value.map(s => s.id))
const isForced = (signal: PluginSignalDto) => props.live.get(signal.topic)?.flags?.forced === true
const running = computed(() => ["running", "degraded"].includes(props.instance.state))
const capabilities = computed(() => new Map([
  ...props.description.sensors.map(c => [`sensor:${c.id}`, c.label] as const),
  ...props.description.actuators.map(c => [`actuator:${c.id}`, c.label] as const)
]))
const capabilityOf = (signal: PluginSignalDto) => capabilities.value.get(`${signal.kind}:${signal.capability}`) ?? signal.capability
watch(() => props.signals, signals => {
  selection.retain(signals.map(s => s.id))
  if (forcing.value && !signals.some(s => s.id === forcing.value!.id && s.topic === forcing.value!.topic)) forceOpen.value = false
})

// the catalog's "+": the entry as it is
async function add(input: PluginSignalInput) {
  await api.addSignal(props.instance.id, input)
  emit("changed")
}

function customize(entry: CatalogEntry) {
  browsing.value = false
  dialog.value = { preset: entry }
}

function bridge(candidates: BridgeCandidate[]) {
  browsing.value = false
  bridging.value = candidates
  bridgeOpen.value = true
}

const bridgeSelected = () => {
  const ids = new Set(selection.pick(visibleIds.value))
  bridge(visible.value.filter(s => ids.has(s.id)).map(s => BridgeDraft.fromSignal(s)))
}
const bridgeEntries = (rows: CatalogRow[]) => bridge(rows.map(row => BridgeDraft.fromEntry(row.key, row.entry, props.description)))

function bridged() {
  selection.clear()
  emit("changed")
}

function force(signal: PluginSignalDto) {
  forcing.value = signal
  forceOpen.value = true
}

async function act(work: () => Promise<unknown>) {
  try {
    await work()
  } catch (error) {
    alert(error instanceof ApiError ? error.message : String(error))
  }
  emit("changed")
}

const remove = (signal: PluginSignalDto) =>
  confirm(`Delete "${signal.label}"? Wires using it are deleted too.`) && act(() => api.removeSignal(props.instance.id, signal.id))
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row flex-wrap items-start justify-between gap-2">
      <div class="grid gap-1.5">
        <CardTitle>Sensors and actuators</CardTitle>
        <CardDescription>Sensors read values from the device, actuators control it. Wire them to a Miniserver or to each other.</CardDescription>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" :disabled="!running" :title="running ? 'What the plugin found on the device' : 'The catalog needs the plugin running'" @click="browsing = true">
          <FolderTree class="size-4" /> Add from catalog
        </Button>
        <Button size="sm" variant="outline" @click="dialog = {}"><Plus class="size-4" /> Add manually</Button>
      </div>
    </CardHeader>
    <CardContent class="space-y-3">
      <ListToolbar v-model="query" :shown="visible.length" :total="signals.length" placeholder="Search name, what or topic">
        <RecordButtons v-if="selection.pick(visibleIds).length" :ids="selection.pick(visibleIds)" />
        <Button v-if="selection.pick(visibleIds).length" size="sm" class="h-8" @click="bridgeSelected">
          <Cable class="size-4" /> Connect {{ selection.pick(visibleIds).length }} to a Miniserver…
        </Button>
      </ListToolbar>
      <VirtualTable
        :rows="visible" :row-key="s => s.id" columns="1.25rem minmax(8rem,1.4fr) 5.5rem minmax(6rem,1fr) minmax(10rem,2fr) minmax(7rem,1fr) 9.5rem"
        :empty="signals.length ? 'Nothing matches.' : 'Nothing added yet. Add from the catalog, or add one manually.'"
      >
        <template #header>
          <Checkbox :model-value="selection.stateOf(visibleIds)" aria-label="Select all shown" @update:model-value="selection.toggleAll(visibleIds)" />
          <span>Name</span><span>Kind</span><span>What</span><span>Topic</span><span>Value</span><span></span>
        </template>
        <template #row="{ row }">
          <Checkbox :model-value="selection.has(row.id)" :aria-label="`Select ${row.label}`" @update:model-value="v => selection.toggle(row.id, v === true)" />
          <span class="flex min-w-0 items-center gap-1.5">
            <CircleAlert v-if="row.error" class="size-4 shrink-0 text-destructive" :title="row.error" />
            <span class="truncate font-medium" :title="row.error ?? row.label">{{ row.label }}</span>
            <WiredMark :wires="wired.of(row.id)" />
          </span>
          <span><Badge variant="outline" :title="row.kind === 'sensor' ? 'reads from the device' : 'controls the device'">{{ row.kind }}</Badge></span>
          <span class="truncate text-muted-foreground" :title="`${row.capability} ${JSON.stringify(row.params)}`">{{ capabilityOf(row) }}</span>
          <span class="truncate font-mono text-xs" :title="row.topic">{{ row.topic }}</span>
          <span class="flex min-w-0 items-center gap-1.5">
            <Lock v-if="isForced(row)" class="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-label="forced" />
            <span class="truncate"><ValueText :value="live.get(row.topic)?.value" /></span>
          </span>
          <SignalActions
            :label="row.label" :forced="isForced(row)" :recorded="recorded.has(row.id)" wirable @history="historyFor = { id: row.id, label: row.label, topic: row.topic }"
            @edit="dialog = { initial: row }" @wire="emit('wire', row)" @force="force(row)" @release="act(() => bus.release(row.topic))" @remove="remove(row)"
          />
        </template>
      </VirtualTable>
    </CardContent>
    <PluginSignalDialog
      v-model:target="dialog" :instance-id="instance.id" :description="description" :topic-base="`${instance.plugin}/${instance.slug}`" @saved="emit('changed')"
    />
    <Dialog v-model:open="browsing">
      <DialogContent class="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Add from the catalog of {{ instance.label }}</DialogTitle>
          <DialogDescription>
            What the plugin found on the device. + adds an entry as it is, the sliders let you change it first. Tick several to connect them to a
            Miniserver in one go.
          </DialogDescription>
        </DialogHeader>
        <CatalogBrowser v-if="browsing" :instance-id="instance.id" :signals="signals" :add="add" @customize="customize" @bridge="bridgeEntries" />
      </DialogContent>
    </Dialog>
    <BridgeDialog v-model:open="bridgeOpen" :instance-id="instance.id" :candidates="bridging" @changed="bridged" />
    <SignalHistorySheet v-model:subject="historyFor" :live="live" />
    <ForceDialog
      v-if="forcing" v-model:open="forceOpen" :topic="forcing.topic" :current="live.get(forcing.topic)?.value"
      :value-type="forcing.valueType === 'any' ? undefined : forcing.valueType"
    />
  </Card>
</template>
