<script setup lang="ts">
import { computed } from "vue"
import type { MiniserverLoadDto } from "@lox-nexus/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadLevel } from "../../lib/LoadLevel.ts"
import { MessageText } from "../../lib/MessageText.ts"
import LoadHistoryChart from "./LoadHistoryChart.vue"
import LoadMeter from "./LoadMeter.vue"

/** Current intercommunication load against Loxone's limit, the last hour as a chart, and the same data as a table. */
const props = defineProps<{ load: MiniserverLoadDto }>()
const total = computed(() => props.load.current.incomingPerSecond + props.load.current.outgoingPerSecond)
const newestFirst = computed(() => props.load.history.slice().reverse())
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Intercommunication load</CardTitle>
      <CardDescription>
        Loxone guarantees {{ load.limitPerSecond }} messages per second, averaged over {{ load.windowSeconds / 60 }} minutes.
        Counted here: packets from the Miniserver and packets Nexus sends to it, resends included.
        Traffic with other systems is not visible to Nexus, so the real load can be higher.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <LoadMeter :percent="load.current.percent" />
      <dl class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div><dt class="inline text-muted-foreground">Average </dt><dd class="inline font-medium">{{ total.toFixed(1) }} of {{ load.limitPerSecond }} msg/s</dd></div>
        <div><dt class="inline text-muted-foreground">From the Miniserver </dt><dd class="inline">{{ load.current.incomingPerSecond.toFixed(1) }}/s</dd></div>
        <div><dt class="inline text-muted-foreground">To the Miniserver </dt><dd class="inline">{{ load.current.outgoingPerSecond.toFixed(1) }}/s</dd></div>
      </dl>
      <LoadHistoryChart :samples="load.history" :limit-per-second="load.limitPerSecond" />
      <details class="text-sm">
        <summary class="cursor-pointer text-muted-foreground">Show as table</summary>
        <div class="mt-2 max-h-64 overflow-auto rounded-md border">
          <table class="w-full text-xs" style="font-variant-numeric: tabular-nums">
            <thead class="sticky top-0 bg-card text-muted-foreground">
              <tr><th class="px-3 py-1 text-left font-medium">Time</th><th class="px-3 py-1 text-right font-medium">Load</th><th class="px-3 py-1 text-right font-medium">From/s</th><th class="px-3 py-1 text-right font-medium">To/s</th></tr>
            </thead>
            <tbody>
              <tr v-for="sample in newestFirst" :key="sample.ts" class="border-t">
                <td class="px-3 py-1">{{ MessageText.time(sample.ts).slice(0, 8) }}</td>
                <td class="px-3 py-1 text-right">{{ LoadLevel.format(sample.percent) }}</td>
                <td class="px-3 py-1 text-right">{{ sample.incomingPerSecond.toFixed(2) }}</td>
                <td class="px-3 py-1 text-right">{{ sample.outgoingPerSecond.toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </CardContent>
  </Card>
</template>
