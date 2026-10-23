<script setup lang="ts">
import { computed } from "vue"
import { LoadLevel } from "../../lib/LoadLevel.ts"

/**
 * Load as a meter: the fill carries severity, the track is a light step of the same colour so the
 * state reads across the whole bar. Above 100% the bar stays full; the number tells how far over.
 */
const props = defineProps<{ percent: number; compact?: boolean }>()
const level = computed(() => LoadLevel.of(props.percent))
const width = computed(() => `${Math.min(100, Math.max(0, props.percent))}%`)
</script>

<template>
  <div class="flex items-center gap-2" :class="compact ? 'min-w-36' : 'w-full'">
    <div
      role="meter" :aria-valuenow="Math.round(percent)" aria-valuemin="0" aria-valuemax="100"
      :aria-label="`Intercommunication load ${LoadLevel.format(percent)}, ${level.label}`"
      class="relative flex-1 overflow-hidden rounded-full"
      :class="compact ? 'h-1.5' : 'h-2.5'"
      :style="{ background: `color-mix(in oklab, ${level.color} 18%, transparent)` }"
    >
      <div class="h-full rounded-full transition-[width] duration-500" :style="{ width, background: level.color }"></div>
    </div>
    <span class="flex shrink-0 items-center gap-1 text-sm" :class="compact ? 'w-14 justify-end' : ''">
      <component :is="level.icon" v-if="!compact || percent >= LoadLevel.HIGH_FROM" class="size-3.5" :style="{ color: level.color }" />
      <span class="font-medium">{{ LoadLevel.format(percent) }}</span>
      <span v-if="!compact" class="text-muted-foreground">{{ level.label }}</span>
    </span>
  </div>
</template>
