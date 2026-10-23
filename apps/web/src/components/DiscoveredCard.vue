<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { DiscoveredPacketDto } from "@lox-nexus/api"
import { Download } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTypes } from "../lib/DataTypes.ts"
import { Selection } from "../lib/Selection.ts"
import { TextFilter } from "../lib/TextFilter.ts"
import ListToolbar from "./data/ListToolbar.vue"
import VirtualTable from "./data/VirtualTable.vue"
import ValueText from "./ValueText.vue"

/**
 * Packet ids the Miniserver sends that no signal is configured for yet (up to 1000). Searchable,
 * newest first, and adoptable in bulk: adopting turns each into an input signal of its data type.
 */
const props = defineProps<{
  packets: DiscoveredPacketDto[]
  adopt: (packets: DiscoveredPacketDto[], progress: (done: number) => void) => Promise<void>
}>()
const query = ref("")
const selection = new Selection()
const progress = ref<string>()

const adoptable = (packet: DiscoveredPacketDto) => packet.dataType <= 6
const visible = computed(() => {
  const filter = new TextFilter(query.value)
  return props.packets.filter(p => filter.matches(p.packetId, DataTypes.nameOf(p.dataType))).sort((a, b) => b.lastSeen - a.lastSeen)
})
const visibleIds = computed(() => visible.value.filter(adoptable).map(p => p.packetId))
watch(() => props.packets, packets => selection.retain(packets.map(p => p.packetId)))

const ago = (ts: number) => {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000))
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}min ago`
}

async function run(packets: DiscoveredPacketDto[]) {
  try {
    await props.adopt(packets, done => (progress.value = `Adopting ${done}/${packets.length}…`))
  } finally {
    progress.value = undefined
    selection.clear()
  }
}

function adoptSelected() {
  const ids = new Set(selection.pick(visibleIds.value))
  return run(visible.value.filter(p => ids.has(p.packetId)))
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Discovered</CardTitle>
      <CardDescription>Adopting a packet turns it into an input signal of the type it arrives with.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-3">
      <ListToolbar v-model="query" :shown="visible.length" :total="packets.length" placeholder="Search packet or type">
        <Button v-if="selection.size" size="sm" class="h-8" :disabled="!!progress" @click="adoptSelected">
          <Download class="size-4" /> {{ progress ?? `Adopt ${selection.pick(visibleIds).length}` }}
        </Button>
      </ListToolbar>
      <VirtualTable
        :rows="visible" :row-key="p => p.packetId" columns="1.25rem minmax(8rem,1fr) 9rem minmax(8rem,1.5fr) 6rem 5.5rem" max-height="40vh"
        :empty="packets.length ? 'No packet matches.' : 'Nothing unknown received yet.'"
      >
        <template #header>
          <Checkbox :model-value="selection.stateOf(visibleIds)" aria-label="Select all shown" @update:model-value="selection.toggleAll(visibleIds)" />
          <span>Packet</span><span>Type</span><span>Last value</span><span>Last seen</span><span></span>
        </template>
        <template #row="{ row }">
          <Checkbox :model-value="selection.has(row.packetId)" :disabled="!adoptable(row)" :aria-label="`Select ${row.packetId}`" @update:model-value="v => selection.toggle(row.packetId, v === true)" />
          <span class="truncate font-mono">{{ row.packetId }}</span>
          <span class="truncate text-muted-foreground">{{ DataTypes.nameOf(row.dataType) }}</span>
          <span class="truncate"><ValueText :value="row.value" /></span>
          <span class="text-muted-foreground">{{ ago(row.lastSeen) }}</span>
          <Button size="sm" variant="outline" class="h-7" :disabled="!adoptable(row) || !!progress" @click="run([row])"><Download class="size-4" /> Adopt</Button>
        </template>
      </VirtualTable>
    </CardContent>
  </Card>
</template>
