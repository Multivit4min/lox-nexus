<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import type { PluginInstanceDto, PluginSignalDto, PluginSignalInput } from "@lox-nexus/api"
import type { CatalogEntry, PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { Cable, ChevronRight, FolderTree, Plus } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppContext } from "../../AppContext.ts"
import { ApiError } from "../../api/ApiError.ts"
import { BridgeDraft, type BridgeCandidate } from "../../lib/BridgeDraft.ts"
import type { CatalogRow } from "../../lib/CatalogTree.ts"
import { Selection } from "../../lib/Selection.ts"
import { SignalGroups } from "../../lib/SignalGroups.ts"
import { TextFilter } from "../../lib/TextFilter.ts"
import type { LiveValues } from "../../stores/LiveValues.ts"
import ListToolbar from "../data/ListToolbar.vue"
import VirtualTable from "../data/VirtualTable.vue"
import ForceDialog from "../inspector/ForceDialog.vue"
import RecordButtons from "../history/RecordButtons.vue"
import SignalHistorySheet, { type HistorySubject } from "../history/SignalHistorySheet.vue"
import BridgeDialog from "./BridgeDialog.vue"
import CatalogBrowser from "./CatalogBrowser.vue"
import PluginSignalDialog, { type SignalDialogTarget } from "./PluginSignalDialog.vue"
import PluginSignalRow from "./PluginSignalRow.vue"

/**
 * The sensors and actuators of one plugin instance with live values. Rows can be edited, forced,
 * released and deleted; new ones come from the plugin's catalog or are added manually.
 * Selected signals, or catalog entries, can be connected to a Miniserver in one step. Signals of one
 * device (the params the plugin marked with signalGroup()) are shown under a header that collapses.
 */
const props = defineProps<{ instance: PluginInstanceDto; description: PluginDescription; signals: PluginSignalDto[]; live: LiveValues }>()
const emit = defineEmits<{ changed: []; wire: [signal: PluginSignalDto] }>()
const { plugins: api, bus, recorded, wired } = AppContext.use()
const groups = computed(() => new SignalGroups(props.description))
// not kept across visits: a list opens with every group expanded
const collapsed = ref(new Set<string>())
const toggleGroup = (key: string) => (collapsed.value = new Set(collapsed.value.has(key) ? [...collapsed.value].filter(k => k !== key) : [...collapsed.value, key]))
const dialog = ref<SignalDialogTarget>()
const browsing = ref(false)
const forcing = ref<PluginSignalDto>()
const forceOpen = ref(false)
const query = ref("")
const selection = new Selection()
const historyFor = ref<HistorySubject>()
onMounted(() => void recorded.load())
// when signals come or go (a deletion takes its wires along); not on the page's periodic reload of the same list
watch(() => props.signals.map(s => s.id).join(), () => void wired.load(), { immediate: true })
const bridging = ref<BridgeCandidate[]>([])
const bridgeOpen = ref(false)

const visible = computed(() => {
  const filter = new TextFilter(query.value)
  return props.signals.filter(s => filter.matches(s.label, capabilityOf(s), s.capability, s.topic, groups.value.of(s) ?? ""))
})
const visibleIds = computed(() => visible.value.map(s => s.id))
const rows = computed(() => groups.value.rows(visible.value, collapsed.value))
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

// connecting adds wires to signals that may already exist
function bridged() {
  selection.clear()
  void wired.load()
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
        :rows="rows" :row-key="row => row.type === 'group' ? `group:${row.key}` : row.signal.id" :row-class="row => row.type === 'group' ? 'bg-muted/40' : undefined" columns="1.25rem minmax(8rem,1.4fr) 5.5rem minmax(6rem,1fr) minmax(10rem,2fr) minmax(7rem,1fr) 9.5rem"
        :empty="signals.length ? 'Nothing matches.' : 'Nothing added yet. Add from the catalog, or add one manually.'"
      >
        <template #header>
          <Checkbox :model-value="selection.stateOf(visibleIds)" aria-label="Select all shown" @update:model-value="selection.toggleAll(visibleIds)" />
          <span>Name</span><span>Kind</span><span>What</span><span>Topic</span><span>Value</span><span></span>
        </template>
        <template #row="{ row }">
          <template v-if="row.type === 'group'">
            <Checkbox :model-value="selection.stateOf(row.ids)" :aria-label="`Select all of ${row.label}`" @update:model-value="selection.toggleAll(row.ids)" />
            <button type="button" class="col-span-6 flex min-w-0 items-center gap-1.5 text-left" :aria-expanded="row.open" @click="toggleGroup(row.key)">
              <ChevronRight class="size-4 shrink-0 transition-transform" :class="row.open && 'rotate-90'" />
              <span class="truncate font-mono text-xs font-medium">{{ row.label }}</span>
              <span class="shrink-0 text-xs text-muted-foreground">{{ row.ids.length }} signals</span>
            </button>
          </template>
          <PluginSignalRow
            v-else :row="row.signal" :what="capabilityOf(row.signal)" :live="live" :selected="selection.has(row.signal.id)" :in-group="row.inGroup"
            @select="v => selection.toggle(row.signal.id, v)" @history="historyFor = { id: row.signal.id, label: row.signal.label, topic: row.signal.topic }"
            @edit="dialog = { initial: row.signal }" @wire="emit('wire', row.signal)" @force="force(row.signal)" @release="act(() => bus.release(row.signal.topic))"
            @remove="remove(row.signal)"
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
