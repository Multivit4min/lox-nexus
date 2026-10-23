<script setup lang="ts">
import { computed, ref } from "vue"
import type { MiniserverLoadDto } from "@lox-nexus/api"
import { LoadLevel } from "../../lib/LoadLevel.ts"
import { MessageText } from "../../lib/MessageText.ts"
import VirtualTable from "../data/VirtualTable.vue"
import LoadHistoryChart from "./LoadHistoryChart.vue"
import LoadMeter from "./LoadMeter.vue"

/** What's behind the header's load figure: the limit, rates by direction, the last hour as a chart, or as a table. */
const props = defineProps<{ load: MiniserverLoadDto }>()
const view = ref<"chart" | "table">("chart")
const total = computed(() => props.load.current.incomingPerSecond + props.load.current.outgoingPerSecond)
const newestFirst = computed(() => props.load.history.slice().reverse())
</script>

<template>
  <div class="space-y-3">
    <div>
      <h3 class="font-medium">Intercommunication load</h3>
      <p class="text-xs text-muted-foreground">
        Loxone guarantees {{ load.limitPerSecond }} messages/s averaged over {{ load.windowSeconds / 60 }} minutes.
        Counted: packets from the Miniserver and packets Nexus sends, resends included. Traffic with
        other systems isn't visible here, so the real load can be higher.
      </p>
    </div>
    <LoadMeter :percent="load.current.percent" />
    <dl class="flex flex-wrap gap-x-5 gap-y-1 text-xs">
      <div><dt class="inline text-muted-foreground">Average </dt><dd class="inline font-medium">{{ total.toFixed(1) }} of {{ load.limitPerSecond }}/s</dd></div>
      <div><dt class="inline text-muted-foreground">From Miniserver </dt><dd class="inline">{{ load.current.incomingPerSecond.toFixed(1) }}/s</dd></div>
      <div><dt class="inline text-muted-foreground">To Miniserver </dt><dd class="inline">{{ load.current.outgoingPerSecond.toFixed(1) }}/s</dd></div>
    </dl>
    <div class="flex items-center justify-between">
      <span class="text-xs text-muted-foreground">Last hour</span>
      <div class="flex gap-1 text-xs">
        <button v-for="option in (['chart', 'table'] as const)" :key="option" class="rounded px-2 py-0.5" :class="view === option ? 'bg-secondary' : 'text-muted-foreground hover:bg-accent'" @click="view = option">{{ option }}</button>
      </div>
    </div>
    <LoadHistoryChart v-if="view === 'chart'" :samples="load.history" :limit-per-second="load.limitPerSecond" />
    <VirtualTable
      v-else :rows="newestFirst" :row-key="s => String(s.ts)" columns="1fr 4rem 4.5rem 4.5rem" :row-height="28" max-height="180px"
      empty="The first sample arrives within 5 seconds."
    >
      <template #header><span>Time</span><span class="text-right">Load</span><span class="text-right">From/s</span><span class="text-right">To/s</span></template>
      <template #row="{ row }">
        <span class="text-xs" style="font-variant-numeric: tabular-nums">{{ MessageText.time(row.ts).slice(0, 8) }}</span>
        <span class="text-right text-xs">{{ LoadLevel.format(row.percent) }}</span>
        <span class="text-right text-xs">{{ row.incomingPerSecond.toFixed(2) }}</span>
        <span class="text-right text-xs">{{ row.outgoingPerSecond.toFixed(2) }}</span>
      </template>
    </VirtualTable>
  </div>
</template>
