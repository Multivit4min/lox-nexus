<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { PluginInstanceDto, PluginSignalDto, PluginSignalInput } from "@lox-nexus/api"
import type { CatalogEntry, PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { CircleAlert, FolderTree, Lock, Plus } from "@lucide/vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppContext } from "../../AppContext.ts"
import { ApiError } from "../../api/ApiError.ts"
import { TextFilter } from "../../lib/TextFilter.ts"
import type { LiveValues } from "../../stores/LiveValues.ts"
import ListToolbar from "../data/ListToolbar.vue"
import VirtualTable from "../data/VirtualTable.vue"
import ForceDialog from "../inspector/ForceDialog.vue"
import SignalActions from "../SignalActions.vue"
import ValueText from "../ValueText.vue"
import CatalogBrowser from "./CatalogBrowser.vue"
import PluginSignalForm from "./PluginSignalForm.vue"

/**
 * The sensors and actuators of one plugin instance with live values. Rows can be edited, forced,
 * released and deleted; new ones come from the plugin's catalog or are configured by hand.
 */
const props = defineProps<{ instance: PluginInstanceDto; description: PluginDescription; signals: PluginSignalDto[]; live: LiveValues }>()
const emit = defineEmits<{ changed: []; wire: [signal: PluginSignalDto] }>()
const { plugins: api, bus } = AppContext.use()
const adding = ref(false)
const preset = ref<CatalogEntry>()
const browsing = ref(false)
const editing = ref<PluginSignalDto>()
const forcing = ref<PluginSignalDto>()
const forceOpen = ref(false)
const query = ref("")

const visible = computed(() => {
  const filter = new TextFilter(query.value)
  return props.signals.filter(s => filter.matches(s.label, s.capability, s.topic))
})
const isForced = (signal: PluginSignalDto) => props.live.get(signal.topic)?.flags?.forced === true
const running = computed(() => ["running", "degraded"].includes(props.instance.state))
watch(() => props.signals, signals => {
  if (forcing.value && !signals.some(s => s.id === forcing.value!.id && s.topic === forcing.value!.topic)) forceOpen.value = false
})

async function add(input: PluginSignalInput) {
  await api.addSignal(props.instance.id, input)
  adding.value = false
  preset.value = undefined
  emit("changed")
}

async function update(input: PluginSignalInput) {
  await api.updateSignal(props.instance.id, editing.value!.id, input)
  editing.value = undefined
  emit("changed")
}

function customize(entry: CatalogEntry) {
  browsing.value = false
  preset.value = entry
  adding.value = true
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
    <CardHeader class="flex flex-row items-center justify-between gap-2">
      <CardTitle>Signals</CardTitle>
      <div class="flex gap-2">
        <Button size="sm" variant="outline" :disabled="!running" :title="running ? undefined : 'The catalog needs the plugin running'" @click="browsing = true">
          <FolderTree class="size-4" /> Browse catalog
        </Button>
        <Button size="sm" variant="outline" @click="preset = undefined; adding = true"><Plus class="size-4" /> Add signal</Button>
      </div>
    </CardHeader>
    <CardContent class="space-y-3">
      <ListToolbar v-model="query" :shown="visible.length" :total="signals.length" placeholder="Search name, capability or topic" />
      <VirtualTable
        :rows="visible" :row-key="s => s.id" columns="minmax(8rem,1.4fr) 5.5rem minmax(6rem,1fr) minmax(10rem,2fr) minmax(7rem,1fr) 7.75rem"
        :empty="signals.length ? 'No signal matches.' : 'No signals yet. Browse the catalog or add one by hand.'"
      >
        <template #header><span>Name</span><span>Kind</span><span>Capability</span><span>Topic</span><span>Value</span><span></span></template>
        <template #row="{ row }">
          <span class="flex min-w-0 items-center gap-1.5">
            <CircleAlert v-if="row.error" class="size-4 shrink-0 text-destructive" :title="row.error" />
            <span class="truncate font-medium" :title="row.error ?? row.label">{{ row.label }}</span>
          </span>
          <span><Badge variant="outline">{{ row.kind }}</Badge></span>
          <span class="truncate text-muted-foreground" :title="JSON.stringify(row.params)">{{ row.capability }}</span>
          <span class="truncate font-mono text-xs" :title="row.topic">{{ row.topic }}</span>
          <span class="flex min-w-0 items-center gap-1.5">
            <Lock v-if="isForced(row)" class="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-label="forced" />
            <span class="truncate"><ValueText :value="live.get(row.topic)?.value" /></span>
          </span>
          <SignalActions
            :label="row.label" :forced="isForced(row)" wirable
            @edit="editing = row" @wire="emit('wire', row)" @force="force(row)" @release="act(() => bus.release(row.topic))" @remove="remove(row)"
          />
        </template>
      </VirtualTable>
    </CardContent>
    <Dialog v-model:open="adding">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader><DialogTitle>Add signal</DialogTitle></DialogHeader>
        <PluginSignalForm v-if="adding" :key="preset ? JSON.stringify(preset) : 'manual'" :description="description" :preset="preset" :submit="add" />
      </DialogContent>
    </Dialog>
    <Dialog :open="!!editing" @update:open="open => !open && (editing = undefined)">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader><DialogTitle>Edit {{ editing?.label }}</DialogTitle></DialogHeader>
        <PluginSignalForm v-if="editing" :key="editing.id" :description="description" :initial="editing" :submit="update" />
      </DialogContent>
    </Dialog>
    <Dialog v-model:open="browsing">
      <DialogContent class="sm:max-w-5xl">
        <DialogHeader><DialogTitle>Catalog of {{ instance.label }}</DialogTitle></DialogHeader>
        <CatalogBrowser v-if="browsing" :instance-id="instance.id" :signals="signals" :add="add" @customize="customize" />
      </DialogContent>
    </Dialog>
    <ForceDialog
      v-if="forcing" v-model:open="forceOpen" :topic="forcing.topic" :current="live.get(forcing.topic)?.value"
      :value-type="forcing.valueType === 'any' ? undefined : forcing.valueType"
    />
  </Card>
</template>
