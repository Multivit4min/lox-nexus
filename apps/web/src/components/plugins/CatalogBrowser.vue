<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import type { PluginSignalDto, PluginSignalInput } from "@lox-nexus/api"
import type { CatalogEntry } from "@lox-nexus/plugin-sdk/wire"
import { Cable, Check, Plus, SlidersHorizontal } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { AppContext } from "../../AppContext.ts"
import { CatalogTree, type CatalogRow } from "../../lib/CatalogTree.ts"
import { Selection } from "../../lib/Selection.ts"
import { TextFilter } from "../../lib/TextFilter.ts"
import ListToolbar from "../data/ListToolbar.vue"
import VirtualTable from "../data/VirtualTable.vue"
import ValueText from "../ValueText.vue"

/**
 * What a running plugin offers, flattened, searchable and filterable by kind (sensors or actuators,
 * offered once the catalog has both). "Add" configures an entry as it is;
 * "customize" opens it in the signal form to change name or params first. Entries not configured
 * yet can be selected and connected to a Miniserver in one go (`bridge`).
 */
const props = defineProps<{ instanceId: string; signals: PluginSignalDto[]; add: (input: PluginSignalInput) => Promise<void> }>()
const emit = defineEmits<{ customize: [entry: CatalogEntry]; bridge: [rows: CatalogRow[]] }>()
const api = AppContext.use().plugins
const rows = ref<CatalogRow[]>([])
const loading = ref(true)
const failure = ref<string>()
const query = ref("")
const kind = ref<"all" | "sensor" | "actuator">("all")
const KINDS = [["all", "all"], ["sensor", "sensors"], ["actuator", "actuators"]] as const
const mixed = computed(() => new Set(rows.value.map(row => row.entry.kind)).size > 1)
const busy = ref<string>()
const selection = new Selection()

const visible = computed(() => {
  const filter = new TextFilter(query.value)
  return rows.value.filter(row => (kind.value === "all" || row.entry.kind === kind.value) && filter.matches(row.path, row.entry.label, row.entry.capability))
})

// configured entries can't be added again; their signals are connected from the signal list
const selectable = computed(() => visible.value.filter(row => !CatalogTree.configured(row.entry, props.signals)).map(row => row.key))
const picked = () => {
  const keys = new Set(selection.pick(selectable.value))
  return visible.value.filter(row => keys.has(row.key))
}

onMounted(async () => {
  try {
    rows.value = CatalogTree.rows(await api.catalog(props.instanceId))
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
})

async function addRow(row: CatalogRow) {
  busy.value = row.key
  failure.value = undefined
  try {
    const { kind, capability, params, label } = row.entry
    await props.add({ kind, capability, params, label })
  } catch (error) {
    failure.value = `${row.entry.label}: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    busy.value = undefined
  }
}
</script>

<template>
  <div class="grid min-w-0 gap-3">
    <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
    <ListToolbar v-model="query" :shown="visible.length" :total="rows.length" placeholder="Search the catalog">
      <div v-if="mixed" class="flex gap-1" role="group" aria-label="Show">
        <Button
          v-for="[value, text] in KINDS" :key="value" size="sm" class="h-8" :variant="kind === value ? 'secondary' : 'ghost'"
          :aria-pressed="kind === value" @click="kind = value"
        >
          {{ text }}
        </Button>
      </div>
      <Button v-if="selection.pick(selectable).length" size="sm" class="h-8" @click="emit('bridge', picked())">
        <Cable class="size-4" /> Connect {{ selection.pick(selectable).length }} to a Miniserver…
      </Button>
    </ListToolbar>
    <VirtualTable
      :rows="visible" :row-key="row => row.key" columns="1.25rem minmax(8rem,1.2fr) minmax(8rem,1.2fr) minmax(7rem,0.8fr) 5.5rem 5.5rem" max-height="55vh"
      :empty="loading ? 'Loading…' : rows.length ? 'Nothing matches.' : 'The plugin offers no catalog.'"
    >
      <template #header>
        <Checkbox :model-value="selection.stateOf(selectable)" :disabled="!selectable.length" aria-label="Select all shown" @update:model-value="selection.toggleAll(selectable)" />
        <span>Where</span><span>Name</span><span>Value</span><span>Kind</span><span></span>
      </template>
      <template #row="{ row }">
        <span v-if="CatalogTree.configured(row.entry, signals)"></span>
        <Checkbox v-else :model-value="selection.has(row.key)" :aria-label="`Select ${row.entry.label}`" @update:model-value="v => selection.toggle(row.key, v === true)" />
        <span class="truncate text-muted-foreground" :title="row.path">{{ row.path }}</span>
        <span class="truncate font-medium" :title="`${row.entry.capability} ${JSON.stringify(row.entry.params)}`">{{ row.entry.label }}</span>
        <span class="truncate" :title="row.entry.unit">
          <template v-if="row.entry.value"><ValueText :value="row.entry.value" /><span v-if="row.entry.unit" class="ml-1 text-xs text-muted-foreground">{{ row.entry.unit }}</span></template>
          <span v-else class="text-muted-foreground">–</span>
        </span>
        <span><Badge variant="outline">{{ row.entry.kind }}</Badge></span>
        <span class="flex justify-end gap-0.5">
          <Check v-if="CatalogTree.configured(row.entry, signals)" class="m-1.5 size-4 text-emerald-600" aria-label="configured" />
          <Button v-else size="icon" variant="ghost" class="size-7" :title="`Add ${row.entry.label}`" :disabled="!!busy" @click="addRow(row)"><Plus class="size-4" /></Button>
          <Button size="icon" variant="ghost" class="size-7" :title="`Customize ${row.entry.label} before adding`" @click="emit('customize', row.entry)">
            <SlidersHorizontal class="size-4" />
          </Button>
        </span>
      </template>
    </VirtualTable>
  </div>
</template>
