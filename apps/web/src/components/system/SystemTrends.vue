<script setup lang="ts">
import { computed } from "vue"
import type { DiagnosticsSampleDto } from "@lox-nexus/api"
import { CircleAlert, CircleCheck, Hourglass } from "@lucide/vue"
import { HeapTrend, type Trend } from "../../lib/system/HeapTrend.ts"
import { SystemCharts } from "../../lib/system/SystemCharts.ts"

/**
 * The soak-run verdict: whether the heap of Nexus and of each plugin worker stays flat, from every
 * sample since the start (not only the shown range). An icon and a word carry the verdict, never
 * colour alone.
 */
const props = defineProps<{ samples: DiagnosticsSampleDto[]; intervalMs: number }>()

const rows = computed(() => {
  const own = [
    { name: "Nexus heap", points: props.samples.map(s => ({ ts: s.ts, v: s.heapUsed })) },
    { name: "Nexus RSS", points: props.samples.map(s => ({ ts: s.ts, v: s.rss })) }
  ]
  const workers = SystemCharts.workerHeaps(props.samples)
  return [...own, ...workers.map(line => ({ name: `${line.name} (plugin)`, points: line.points }))]
    .map(row => ({ name: row.name, trend: HeapTrend.of(row.points, props.intervalMs) }))
})

const text = (trend: Trend) => {
  const rounded = Math.abs(trend.mibPerHour) < 0.005 ? 0 : trend.mibPerHour
  const rate = `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)} MiB/h`
  return `${rate} over ${trend.hours.toFixed(1)} h, floor ${trend.floorMib.toFixed(1)} MiB`
}
</script>

<template>
  <ul class="grid gap-1.5 text-sm">
    <li v-for="(row, i) in rows" :key="i" class="flex flex-wrap items-center gap-x-2">
      <template v-if="row.trend">
        <CircleCheck v-if="row.trend.verdict !== 'growing'" class="size-4 text-[var(--viz-good)]" aria-hidden="true" />
        <CircleAlert v-else class="size-4 text-[var(--viz-critical)]" aria-hidden="true" />
        <span class="font-medium">{{ row.name }}</span>
        <span>{{ row.trend.verdict }}</span>
        <span class="text-muted-foreground" style="font-variant-numeric: tabular-nums">{{ text(row.trend) }}</span>
      </template>
      <template v-else>
        <Hourglass class="size-4 text-muted-foreground" aria-hidden="true" />
        <span class="font-medium">{{ row.name }}</span>
        <span class="text-muted-foreground">no verdict yet: it needs 10 minutes of warm-up and then an hour of samples</span>
      </template>
    </li>
  </ul>
</template>
