<script setup lang="ts">
import { computed, ref } from "vue"
import { useElementSize } from "@vueuse/core"
import { MessageText } from "../../lib/MessageText.ts"
import { MetricChartGeometry } from "../../lib/system/MetricChartGeometry.ts"
import { SystemCharts, type ChartSpec } from "../../lib/system/SystemCharts.ts"

/**
 * One chart of the System page: its lines over the chosen range on one axis from 0, a legend with
 * each line's latest value (so identity never rests on colour alone), and a crosshair that snaps to
 * the nearest sample on hover or with the arrow keys, listing every line's value there.
 */
const props = defineProps<{ spec: ChartSpec; from: number; to: number; gapMs: number }>()
const HEIGHT = 170
const container = ref<HTMLElement>()
const width = useElementSize(container).width
const active = ref<number>()

// memory ticks are round in MiB, not in bytes
const geometry = computed(() => new MetricChartGeometry(props.spec.series, props.from, props.to, width.value, HEIGHT, props.gapMs, props.spec.unit === "bytes" ? 1024 * 1024 : 1))
const color = (index: number) => `var(--viz-cat-${index + 1})`
const format = (v: number) => SystemCharts.format(props.spec.unit, v)
const latest = (index: number) => props.spec.series[index]?.points.at(-1)?.v
const valueAt = (index: number, ts: number) => props.spec.series[index]?.points.find(point => point.ts === ts)?.v
const times = computed(() => [...new Set(props.spec.series.flatMap(line => line.points.map(point => point.ts)))].filter(ts => ts >= props.from).sort((a, b) => a - b))

function onPointer(event: PointerEvent) {
  const box = container.value?.getBoundingClientRect()
  if (box) active.value = geometry.value.nearest(event.clientX - box.left)
}

function onKey(event: KeyboardEvent) {
  const list = times.value
  if (!list.length) return
  const at = active.value === undefined ? list.length : list.indexOf(active.value)
  if (event.key === "ArrowLeft") active.value = list[Math.max(0, at - 1)]
  else if (event.key === "ArrowRight") active.value = list[Math.min(list.length - 1, at + 1)]
  else if (event.key === "Escape") active.value = undefined
  else return
  event.preventDefault()
}
</script>

<template>
  <figure class="grid gap-2">
    <figcaption class="text-sm font-medium">{{ spec.title }}</figcaption>
    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <li v-for="(line, i) in spec.series" :key="i" class="flex items-center gap-1.5">
        <span class="inline-block h-0.5 w-3 rounded-full" :style="{ background: color(i) }"></span>
        <span class="text-muted-foreground">{{ line.name }}</span>
        <span v-if="latest(i) !== undefined" style="font-variant-numeric: tabular-nums">{{ format(latest(i)!) }}</span>
      </li>
    </ul>
    <div
      ref="container" class="relative w-full select-none outline-none focus-visible:ring-2 focus-visible:ring-ring" tabindex="0"
      :aria-label="`${spec.title}; use the arrow keys to read samples`"
      @pointermove="onPointer" @pointerleave="active = undefined" @keydown="onKey" @blur="active = undefined"
    >
      <svg v-if="width > 0" :width="width" :height="HEIGHT" class="block" aria-hidden="true">
        <g class="text-[11px]" style="font-variant-numeric: tabular-nums">
          <template v-for="tick in geometry.yTicks()" :key="`y${tick}`">
            <line :x1="MetricChartGeometry.MARGIN.left" :x2="width - MetricChartGeometry.MARGIN.right" :y1="geometry.y(tick)" :y2="geometry.y(tick)" :stroke="tick === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'" />
            <text :x="MetricChartGeometry.MARGIN.left - 6" :y="geometry.y(tick)" text-anchor="end" dominant-baseline="middle" class="fill-muted-foreground">{{ format(tick) }}</text>
          </template>
          <text v-for="tick in geometry.axis.ticks(5)" :key="`x${tick}`" :x="geometry.axis.x(tick)" :y="HEIGHT - 6" text-anchor="middle" class="fill-muted-foreground">{{ geometry.axis.label(tick, 5) }}</text>
        </g>
        <path v-for="(line, i) in spec.series" :key="i" :d="geometry.path(line)" fill="none" :stroke="color(i)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <template v-if="active !== undefined">
          <line :x1="geometry.axis.x(active)" :x2="geometry.axis.x(active)" :y1="MetricChartGeometry.MARGIN.top" :y2="geometry.y(0)" stroke="var(--viz-axis)" />
          <template v-for="(line, i) in spec.series" :key="`dot-${i}`">
            <circle v-if="valueAt(i, active) !== undefined" :cx="geometry.axis.x(active)" :cy="geometry.y(valueAt(i, active)!)" r="4" :fill="color(i)" stroke="var(--card)" stroke-width="2" />
          </template>
        </template>
      </svg>
      <div
        v-if="active !== undefined" role="status"
        class="pointer-events-none absolute top-1 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm"
        :style="{ left: `${Math.min(geometry.axis.x(active) + 10, width - 200)}px` }"
      >
        <div class="text-muted-foreground">{{ MessageText.time(active).slice(0, 8) }}</div>
        <template v-for="(line, i) in spec.series" :key="`tip-${i}`">
          <div v-if="valueAt(i, active) !== undefined" class="flex items-center gap-1.5">
            <span class="inline-block size-2 rounded-full" :style="{ background: color(i) }"></span>{{ line.name }}
            <span class="ml-auto pl-3 font-medium" style="font-variant-numeric: tabular-nums">{{ format(valueAt(i, active)!) }}</span>
          </div>
        </template>
      </div>
      <p v-if="!times.length" class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">No samples in this range yet.</p>
    </div>
    <p v-if="spec.note" class="text-xs text-muted-foreground">{{ spec.note }}</p>
  </figure>
</template>
