<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { LoxoneProjectDto, LoxoneSignalDto, MiniserverDto } from "@lox-nexus/api"
import { Download } from "@lucide/vue"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AppContext } from "../../AppContext.ts"
import { DataTypes } from "../../lib/DataTypes.ts"
import { ProjectDiff, type ProjectRow } from "../../lib/ProjectDiff.ts"
import { Selection } from "../../lib/Selection.ts"
import VirtualTable from "../data/VirtualTable.vue"

/**
 * One peer of a read project next to the configured signals. New signals and those whose type
 * differs are preselected; importing adds the new ones (named as in Loxone Config) and changes
 * only the data type of existing ones, so their names, topics and wires stay.
 */
const props = defineProps<{ project: LoxoneProjectDto; ms: MiniserverDto; signals: LoxoneSignalDto[] }>()
const emit = defineEmits<{ changed: [] }>()
const api = AppContext.use().miniservers

const peerIndex = ref(String(Math.max(0, props.project.peers.indexOf(ProjectDiff.peerFor(props.project, props.ms)!))))
const peer = computed(() => props.project.peers[Number(peerIndex.value)])
const rows = computed(() => (peer.value ? ProjectDiff.rows(peer.value, props.signals) : []))
const mismatches = computed(() => (peer.value ? ProjectDiff.mismatches(peer.value, props.ms) : []))
const selectable = computed(() => rows.value.filter(ProjectDiff.actionable).map(row => row.key))
const selection = new Selection()
const progress = ref<string>()
const failures = ref<string[]>([])

const STATUS: Record<ProjectRow["status"], { text: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  new: { text: "New", variant: "default" },
  same: { text: "Configured", variant: "secondary" },
  differs: { text: "Type differs", variant: "outline" },
  unsupported: { text: "Unsupported type", variant: "destructive" }
}

// choosing a peer preselects what an import would change for it
watch(peer, () => {
  selection.clear()
  for (const key of selectable.value) selection.toggle(key, true)
}, { immediate: true })

// one request at a time; a failing row is reported, stays selected, and the rest still run
async function importSelected() {
  const chosen = rows.value.filter(row => selection.has(row.key) && ProjectDiff.actionable(row))
  failures.value = []
  for (const [i, row] of chosen.entries()) {
    progress.value = `Importing ${i + 1}/${chosen.length}…`
    try {
      if (row.existing) await api.updateSignal(props.ms.id, row.existing.id, ProjectDiff.inputFor(row))
      else await api.addSignal(props.ms.id, ProjectDiff.inputFor(row))
      selection.toggle(row.key, false)
    } catch (error) {
      failures.value.push(`${row.signal.direction} ${row.signal.packetId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  progress.value = undefined
  emit("changed")
}
</script>

<template>
  <div class="grid min-w-0 gap-3">
    <p v-if="!project.peers.length" class="text-sm text-muted-foreground">The project has no Network Intercommunication peers.</p>
    <template v-else>
      <Select v-model="peerIndex">
        <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="(p, i) in project.peers" :key="i" :value="String(i)">{{ p.label }} · ID {{ p.id }} · {{ p.host }}:{{ p.port }} · {{ p.signals.length }} objects</SelectItem>
        </SelectContent>
      </Select>
      <Alert v-if="mismatches.length">
        <AlertTitle>Connection settings differ from the project</AlertTitle>
        <AlertDescription><ul class="list-disc pl-4"><li v-for="m in mismatches" :key="m">{{ m }}</li></ul></AlertDescription>
      </Alert>
      <VirtualTable
        :rows="rows" :row-key="row => row.key" columns="1.25rem 3rem 7rem minmax(8rem,1.5fr) 9rem 9rem" max-height="45vh"
        empty="This peer has no inputs or outputs."
      >
        <template #header>
          <Checkbox :model-value="selection.stateOf(selectable)" aria-label="Select all importable" @update:model-value="selection.toggleAll(selectable)" />
          <span>Dir</span><span>Packet</span><span>Name in Loxone Config</span><span>Type</span><span>Status</span>
        </template>
        <template #row="{ row }">
          <Checkbox
            :model-value="selection.has(row.key)" :disabled="!ProjectDiff.actionable(row)" :aria-label="`Select ${row.signal.packetId}`"
            @update:model-value="v => selection.toggle(row.key, v === true)"
          />
          <span class="text-muted-foreground">{{ row.signal.direction }}</span>
          <span class="truncate font-mono">{{ row.signal.packetId }}</span>
          <span class="truncate" :title="row.signal.description">{{ row.signal.label }}</span>
          <span class="truncate text-muted-foreground">{{ row.status === "differs" ? ProjectDiff.typeChange(row) : DataTypes.nameOf(row.signal.dataType) }}</span>
          <span><Badge :variant="STATUS[row.status].variant">{{ STATUS[row.status].text }}</Badge></span>
        </template>
      </VirtualTable>
      <Alert v-if="failures.length" variant="destructive">
        <AlertTitle>Some signals were not imported</AlertTitle>
        <AlertDescription><ul class="list-disc pl-4"><li v-for="f in failures" :key="f">{{ f }}</li></ul></AlertDescription>
      </Alert>
      <Button :disabled="!selection.pick(selectable).length || !!progress" @click="importSelected">
        <Download class="size-4" /> {{ progress ?? `Import ${selection.pick(selectable).length}` }}
      </Button>
    </template>
  </div>
</template>
