<script setup lang="ts">
import { computed } from "vue"
import type { WireDto } from "@lox-nexus/api"
import { Cable } from "@lucide/vue"
import type { SignalWires } from "../stores/WiredSignals.ts"

/**
 * Shows that a signal has wires: a cable, in the series colour while at least one of them runs,
 * grey when all are off or broken, with their number when there are several. The title lists them
 * with their direction and state; nothing shows for a signal without wires.
 */
const props = defineProps<{ wires: SignalWires }>()

const all = computed(() => [...props.wires.in, ...props.wires.out])
const running = computed(() => all.value.some(wire => wire.enabled && wire.active))
const state = (wire: WireDto) => (!wire.enabled ? " (off)" : !wire.active ? " (not running)" : "")
const text = computed(() => [
  ...props.wires.in.map(wire => `Fed by "${wire.label}"${state(wire)}`),
  ...props.wires.out.map(wire => `Feeds "${wire.label}"${state(wire)}`)
].join("\n"))
</script>

<template>
  <span
    v-if="all.length" class="inline-flex shrink-0 items-center gap-0.5 text-xs" :class="running ? 'text-[var(--viz-series)]' : 'text-muted-foreground'"
    :title="text"
  >
    <Cable class="size-3.5" aria-hidden="true" />
    <span v-if="all.length > 1" style="font-variant-numeric: tabular-nums">{{ all.length }}</span>
    <span class="sr-only">{{ text }}</span>
  </span>
</template>
