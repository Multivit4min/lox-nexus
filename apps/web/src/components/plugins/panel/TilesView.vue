<script setup lang="ts">
import type { PanelPart } from "@lox-nexus/plugin-sdk/wire"
import { ToneStyle } from "../../../lib/ToneStyle.ts"
import CellView from "./CellView.vue"

type Tile = Extract<PanelPart, { type: "tiles" }>["tiles"][number]

/** Headline values as big numbers; a bar where the plugin gives a range; a countdown instead of a value. */
defineProps<{ tiles: Tile[] }>()

const value = (tile: Tile) => {
  if (tile.value === null) return "–"
  return typeof tile.value === "number" && tile.decimals !== undefined ? tile.value.toFixed(tile.decimals) : String(tile.value)
}
const share = (tile: Tile) => {
  if (typeof tile.value !== "number" || tile.min === undefined || tile.max === undefined || tile.max <= tile.min) return undefined
  return Math.min(100, Math.max(0, ((tile.value - tile.min) / (tile.max - tile.min)) * 100))
}
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
    <div v-for="(tile, i) in tiles" :key="i" class="grid gap-1 rounded-lg border p-3" :title="tile.hint">
      <span class="text-xs text-muted-foreground">{{ tile.label }}</span>
      <span v-if="tile.until !== undefined" class="text-xl font-semibold"><CellView :cell="{ until: tile.until, tone: tile.tone }" /></span>
      <span v-else :class="['text-xl font-semibold tabular-nums', ToneStyle.text(tile.tone)]">
        {{ value(tile) }}<span v-if="tile.unit && tile.value !== null" class="ml-1 text-sm font-normal text-muted-foreground">{{ tile.unit }}</span>
      </span>
      <div v-if="share(tile) !== undefined" class="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" :aria-valuenow="tile.value ?? undefined" :aria-valuemin="tile.min" :aria-valuemax="tile.max" :aria-label="tile.label">
        <div class="h-full rounded-full bg-primary" :style="{ width: `${share(tile)}%` }"></div>
      </div>
      <span v-if="tile.hint" class="text-xs text-muted-foreground">{{ tile.hint }}</span>
    </div>
  </div>
</template>
