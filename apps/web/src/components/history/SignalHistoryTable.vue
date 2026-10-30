<script setup lang="ts">
import { computed } from "vue"
import type { HistorySeriesDto } from "@lox-nexus/api"
import { HistoryText } from "../../lib/HistoryText.ts"
import VirtualTable from "../data/VirtualTable.vue"

/** The same values as the chart, newest first: every change, or each bucket's average and range. Also the view for text values. */
const props = defineProps<{ series: HistorySeriesDto }>()

const rows = computed(() => {
  const { series } = props
  const text = series.resolution === "raw"
    ? series.points.map(p => ({ ts: p.ts, value: HistoryText.raw(p, series.valueType, series), changes: "" }))
    : series.points.map(p => ({ ts: p.ts, value: HistoryText.bucket(p, series.valueType, series), changes: String(p.n) }))
  return text.reverse()
})
</script>

<template>
  <VirtualTable
    :rows="rows" :row-key="row => String(row.ts)" :columns="series.resolution === 'raw' ? '9rem 1fr' : '9rem 1fr 4.5rem'" :row-height="28" max-height="320px"
    empty="Nothing recorded in this range."
  >
    <template #header>
      <span>{{ series.resolution === "raw" ? "Time" : "From" }}</span><span>{{ series.resolution === "raw" ? "Value" : "Average (lowest – highest)" }}</span>
      <span v-if="series.resolution !== 'raw'" class="text-right">Changes</span>
    </template>
    <template #row="{ row }">
      <span class="text-xs tabular-nums">{{ HistoryText.when(row.ts, series.resolution) }}</span>
      <span class="truncate text-xs" :title="row.value">{{ row.value }}</span>
      <span v-if="series.resolution !== 'raw'" class="text-right text-xs tabular-nums">{{ row.changes }}</span>
    </template>
  </VirtualTable>
</template>
