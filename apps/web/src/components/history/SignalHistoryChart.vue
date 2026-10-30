<script setup lang="ts">
import { computed, ref } from "vue"
import type { HistorySeriesDto } from "@lox-nexus/api"
import { useElementSize } from "@vueuse/core"
import { HistoryText } from "../../lib/HistoryText.ts"
import { SeriesChartGeometry } from "../../lib/SeriesChartGeometry.ts"

/**
 * A signal's history as a staircase (values hold until they change), with each bucket's min/max
 * as a band and gaps (Nexus wasn't running) shaded. A crosshair snaps to the nearest point on
 * hover or with the arrow keys; the table view has the same values without hovering.
 */
const props = defineProps<{ series: HistorySeriesDto; now: number }>()
const HEIGHT = 220
const container = ref<HTMLElement>()
const width = useElementSize(container).width
const active = ref<number>()

const geometry = computed(() => new SeriesChartGeometry(props.series, width.value, HEIGHT, props.now))
const point = computed(() => (active.value === undefined ? undefined : props.series.points[active.value]))
const label = computed(() => {
  const p = point.value
  if (!p) return ""
  const value = "avg" in p ? HistoryText.bucket(p, props.series.valueType, props.series) : HistoryText.raw(p, props.series.valueType, props.series)
  return `${HistoryText.when(p.ts, props.series.resolution)}: ${value}`
})
const top = SeriesChartGeometry.MARGIN.top

function onPointer(event: PointerEvent) {
  const box = container.value?.getBoundingClientRect()
  if (box) active.value = geometry.value.nearest(event.clientX - box.left)
}

function onKey(event: KeyboardEvent) {
  const last = props.series.points.length - 1
  if (last < 0) return
  if (event.key === "ArrowLeft") active.value = Math.max(0, (active.value ?? last + 1) - 1)
  else if (event.key === "ArrowRight") active.value = Math.min(last, (active.value ?? last - 1) + 1)
  else if (event.key === "Escape") active.value = undefined
  else return
  event.preventDefault()
}
</script>

<template>
  <div
    ref="container" class="relative w-full select-none outline-none focus-visible:ring-2 focus-visible:ring-ring" tabindex="0" role="group"
    aria-label="Value history; use the arrow keys to read the values" @pointermove="onPointer" @pointerleave="active = undefined" @keydown="onKey" @blur="active = undefined"
  >
    <svg v-if="width > 0" :width="width" :height="HEIGHT" class="block" aria-hidden="true">
      <g class="text-[11px]" style="font-variant-numeric: tabular-nums">
        <template v-for="tick in geometry.yTicks()" :key="`y${tick}`">
          <line :x1="SeriesChartGeometry.MARGIN.left" :x2="width - SeriesChartGeometry.MARGIN.right" :y1="geometry.y(tick)" :y2="geometry.y(tick)" stroke="var(--viz-grid)" />
          <text :x="SeriesChartGeometry.MARGIN.left - 6" :y="geometry.y(tick)" text-anchor="end" dominant-baseline="middle" class="fill-muted-foreground">
            {{ HistoryText.value(tick, series.valueType) }}
          </text>
        </template>
        <text v-for="tick in geometry.axis.ticks()" :key="`x${tick}`" :x="geometry.axis.x(tick)" :y="HEIGHT - 6" text-anchor="middle" class="fill-muted-foreground">
          {{ geometry.axis.label(tick) }}
        </text>
      </g>
      <rect
        v-for="gap in series.gaps" :key="`g${gap.from}`" :x="geometry.axis.x(gap.from)" :y="top" :width="Math.max(1, geometry.axis.x(gap.to) - geometry.axis.x(gap.from))"
        :height="geometry.plotHeight" fill="var(--viz-grid)" opacity="0.6"
      ><title>Nexus wasn't running</title></rect>
      <path :d="geometry.band()" fill="var(--viz-series)" opacity="0.18" />
      <path :d="geometry.line()" fill="none" stroke="var(--viz-series)" stroke-width="1.75" stroke-linejoin="round" />
      <line v-if="point" :x1="geometry.axis.x(point.ts)" :x2="geometry.axis.x(point.ts)" :y1="top" :y2="top + geometry.plotHeight" stroke="var(--viz-axis)" stroke-dasharray="3 3" />
    </svg>
    <div class="pointer-events-none absolute top-1 right-2 text-xs" aria-live="polite">
      <span v-if="point" class="rounded border bg-popover px-2 py-1 shadow-sm">{{ label }}</span>
    </div>
  </div>
</template>
