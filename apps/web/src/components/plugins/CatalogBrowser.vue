<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import type { PluginSignalDto, PluginSignalInput } from "@lox-nexus/api"
import type { CatalogEntry } from "@lox-nexus/plugin-sdk/wire"
import { Check, Plus, SlidersHorizontal } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AppContext } from "../../AppContext.ts"
import { CatalogTree, type CatalogRow } from "../../lib/CatalogTree.ts"
import { TextFilter } from "../../lib/TextFilter.ts"
import ListToolbar from "../data/ListToolbar.vue"
import VirtualTable from "../data/VirtualTable.vue"

/**
 * What a running plugin offers, flattened and searchable. "Add" configures an entry as it is;
 * "customize" opens it in the signal form to change name or params first.
 */
const props = defineProps<{ instanceId: string; signals: PluginSignalDto[]; add: (input: PluginSignalInput) => Promise<void> }>()
const emit = defineEmits<{ customize: [entry: CatalogEntry] }>()
const api = AppContext.use().plugins
const rows = ref<CatalogRow[]>([])
const loading = ref(true)
const failure = ref<string>()
const query = ref("")
const busy = ref<string>()

const visible = computed(() => {
  const filter = new TextFilter(query.value)
  return rows.value.filter(row => filter.matches(row.path, row.entry.label, row.entry.capability))
})

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
    <ListToolbar v-model="query" :shown="visible.length" :total="rows.length" placeholder="Search the catalog" />
    <VirtualTable
      :rows="visible" :row-key="row => row.key" columns="minmax(8rem,1.2fr) minmax(8rem,1.2fr) 5.5rem 5.5rem" max-height="55vh"
      :empty="loading ? 'Loading…' : rows.length ? 'Nothing matches.' : 'The plugin offers no catalog.'"
    >
      <template #header><span>Where</span><span>Name</span><span>Kind</span><span></span></template>
      <template #row="{ row }">
        <span class="truncate text-muted-foreground" :title="row.path">{{ row.path }}</span>
        <span class="truncate font-medium" :title="`${row.entry.capability} ${JSON.stringify(row.entry.params)}`">{{ row.entry.label }}</span>
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
