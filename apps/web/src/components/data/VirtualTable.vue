<script setup lang="ts" generic="T">
import { computed, ref } from "vue"
import { useVirtualizer } from "@tanstack/vue-virtual"

/**
 * A table for lists that can grow into the thousands: only the rows in view are rendered, so a
 * Miniserver with 2000 signals costs as much as one with 20 (and only visible rows track live
 * values). Columns are a CSS grid template shared by the header and the rows; slots render cells.
 */
const props = withDefaults(defineProps<{
  rows: T[]
  rowKey: (row: T) => string
  /** grid-template-columns, e.g. "2rem 1fr 8rem" */
  columns: string
  rowHeight?: number
  /** the list scrolls inside this height */
  maxHeight?: string
  empty?: string
}>(), { rowHeight: 36, maxHeight: "60vh", empty: "Nothing here." })

defineSlots<{
  header(): unknown
  row(props: { row: T; index: number }): unknown
}>()

const HEADER = 32
const scroller = ref<HTMLElement>()
const virtualizer = useVirtualizer(computed(() => ({
  count: props.rows.length,
  getScrollElement: () => scroller.value ?? null,
  estimateSize: () => props.rowHeight,
  getItemKey: (index: number) => props.rowKey(props.rows[index]!),
  scrollMargin: HEADER,
  overscan: 10
})))
const grid = computed(() => ({ gridTemplateColumns: props.columns }))
</script>

<template>
  <div ref="scroller" role="table" class="overflow-auto rounded-md border text-sm" :style="{ maxHeight }">
    <div role="row" class="sticky top-0 z-10 grid items-center gap-3 border-b bg-card px-3 text-xs font-medium text-muted-foreground" :style="{ ...grid, height: `${HEADER}px` }">
      <slot name="header"></slot>
    </div>
    <div v-if="rows.length === 0" class="px-3 py-6 text-center text-muted-foreground">{{ empty }}</div>
    <!-- getTotalSize() already leaves out the scrollMargin (the header); item.start includes it -->
    <div v-else class="relative w-full" :style="{ height: `${virtualizer.getTotalSize()}px` }">
      <div
        v-for="item in virtualizer.getVirtualItems()" :key="String(item.key)" role="row"
        class="absolute left-0 grid w-full items-center gap-3 border-b px-3 hover:bg-accent/50"
        :style="{ ...grid, height: `${rowHeight}px`, transform: `translateY(${item.start - HEADER}px)` }"
      >
        <slot name="row" :row="rows[item.index]!" :index="item.index"></slot>
      </div>
    </div>
  </div>
</template>
