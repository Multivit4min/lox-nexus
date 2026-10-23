<script setup lang="ts">
import { computed, ref } from "vue"
import type { LoadSampleDto } from "@lox-nexus/api"
import { useElementSize } from "@vueuse/core"
import { LoadChartGeometry } from "../../lib/LoadChartGeometry.ts"
import { LoadLevel } from "../../lib/LoadLevel.ts"
import { MessageText } from "../../lib/MessageText.ts"

/**
 * Up to an hour of load as one area series against the 100% limit (the axis spans the data there is). A crosshair snaps to the
 * nearest sample on hover or with the arrow keys; the tooltip lists the time, the load and both
 * directions. The table view in LoadCard has the same values without hovering.
 */
const props = defineProps<{
  samples: LoadSampleDto[]
  limitPerSecond: number
  /** fixed width in px, for server-side rendering and print; measured from the container otherwise */
  fixedWidth?: number
}>()
const HEIGHT = 180
const container = ref<HTMLElement>()
const measured = useElementSize(container).width
const width = computed(() => props.fixedWidth ?? measured.value)
const active = ref<number>()

const geometry = computed(() => new LoadChartGeometry(props.samples, width.value, HEIGHT, props.samples.at(-1)?.ts ?? Date.now()))
const hovered = computed(() => (active.value === undefined ? undefined : props.samples[active.value]))
const clock = (ts: number) => MessageText.time(ts).slice(0, 5)

function onPointer(event: PointerEvent) {
  const box = container.value?.getBoundingClientRect()
  if (box) active.value = geometry.value.nearest(event.clientX - box.left)
}

function onKey(event: KeyboardEvent) {
  const last = props.samples.length - 1
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
    ref="container" class="relative w-full select-none outline-none focus-visible:ring-2 focus-visible:ring-ring" tabindex="0"
    aria-label="Intercommunication load over the last hour; use the arrow keys to read samples"
    @pointermove="onPointer" @pointerleave="active = undefined" @keydown="onKey" @blur="active = undefined"
  >
    <svg v-if="width > 0" :width="width" :height="HEIGHT" class="block" aria-hidden="true">
      <g class="text-[11px]" style="font-variant-numeric: tabular-nums">
        <template v-for="tick in geometry.yTicks()" :key="`y${tick}`">
          <line :x1="LoadChartGeometry.MARGIN.left" :x2="width - LoadChartGeometry.MARGIN.right" :y1="geometry.y(tick)" :y2="geometry.y(tick)" :stroke="tick === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'" stroke-width="1" />
          <text :x="LoadChartGeometry.MARGIN.left - 6" :y="geometry.y(tick)" text-anchor="end" dominant-baseline="middle" class="fill-muted-foreground">{{ tick }}%</text>
        </template>
        <text v-for="tick in geometry.xTicks()" :key="`x${tick}`" :x="geometry.x(tick)" :y="HEIGHT - 6" text-anchor="middle" class="fill-muted-foreground">{{ clock(tick) }}</text>
      </g>
      <line :x1="LoadChartGeometry.MARGIN.left" :x2="width - LoadChartGeometry.MARGIN.right" :y1="geometry.y(100)" :y2="geometry.y(100)" stroke="var(--viz-critical)" stroke-width="1" />
      <text :x="width - LoadChartGeometry.MARGIN.right + 4" :y="geometry.y(100)" dominant-baseline="middle" class="fill-foreground text-[11px]">limit</text>
      <path :d="geometry.area()" fill="var(--viz-series)" fill-opacity="0.1" />
      <path :d="geometry.line()" fill="none" stroke="var(--viz-series)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <template v-if="hovered">
        <line :x1="geometry.x(hovered.ts)" :x2="geometry.x(hovered.ts)" :y1="LoadChartGeometry.MARGIN.top" :y2="geometry.y(0)" stroke="var(--viz-axis)" stroke-width="1" />
        <circle :cx="geometry.x(hovered.ts)" :cy="geometry.y(hovered.percent)" r="4" fill="var(--viz-series)" stroke="var(--card)" stroke-width="2" />
      </template>
    </svg>
    <div
      v-if="hovered" role="status"
      class="pointer-events-none absolute top-1 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm"
      :style="{ left: `${Math.min(geometry.x(hovered.ts) + 10, width - 170)}px` }"
    >
      <div class="font-semibold">{{ LoadLevel.format(hovered.percent) }} <span class="font-normal text-muted-foreground">{{ LoadLevel.of(hovered.percent).label }}</span></div>
      <div class="text-muted-foreground">{{ MessageText.time(hovered.ts).slice(0, 8) }}</div>
      <div>{{ (hovered.incomingPerSecond + hovered.outgoingPerSecond).toFixed(1) }} of {{ limitPerSecond }} msg/s</div>
      <div class="text-muted-foreground">in {{ hovered.incomingPerSecond.toFixed(1) }} · out {{ hovered.outgoingPerSecond.toFixed(1) }}</div>
    </div>
    <p v-if="samples.length === 0" class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">The first sample arrives within 5 seconds.</p>
  </div>
</template>
