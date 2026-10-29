<script setup lang="ts">
import { computed } from "vue"
import type { DiagnosticsSampleDto } from "@lox-nexus/api"
import { SystemCharts } from "../../lib/system/SystemCharts.ts"

/** The latest sample as a row of figures, for a glance before the charts. */
const props = defineProps<{ sample: DiagnosticsSampleDto }>()

const tiles = computed(() => {
  const s = props.sample
  const workerHeap = s.workers.reduce((sum, worker) => sum + worker.heapUsed, 0)
  return [
    { label: "RSS", value: SystemCharts.format("bytes", s.rss) },
    { label: "Heap used", value: SystemCharts.format("bytes", s.heapUsed), note: `of ${SystemCharts.format("bytes", s.heapTotal)}` },
    { label: "Event loop p99", value: SystemCharts.format("ms", s.loopDelayP99), note: `max ${SystemCharts.format("ms", s.loopDelayMax)}` },
    { label: "CPU", value: SystemCharts.format("percent", s.cpuPercent), note: "of one core" },
    { label: "Bus", value: SystemCharts.format("perSecond", s.busPerSecond), note: `${s.retainedTopics} topics` },
    { label: "Plugin workers", value: String(s.workers.length), note: `${SystemCharts.format("bytes", workerHeap)} heap` },
    { label: "On disk", value: SystemCharts.format("bytes", s.databaseBytes + s.historyBytes + s.pluginsBytes), note: `history ${SystemCharts.format("bytes", s.historyBytes)}` },
    { label: "Live connections", value: String(s.streamClients), note: `${s.wires} wires` }
  ]
})
</script>

<template>
  <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
    <div v-for="tile in tiles" :key="tile.label" class="rounded-md border p-3">
      <dt class="text-xs text-muted-foreground">{{ tile.label }}</dt>
      <dd class="text-lg font-semibold" style="font-variant-numeric: tabular-nums">{{ tile.value }}</dd>
      <dd v-if="tile.note" class="text-xs text-muted-foreground">{{ tile.note }}</dd>
    </div>
  </dl>
</template>
