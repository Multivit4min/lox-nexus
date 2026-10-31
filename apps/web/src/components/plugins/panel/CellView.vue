<script setup lang="ts">
import { computed } from "vue"
import type { Cell } from "@lox-nexus/plugin-sdk/wire"
import { PanelCells } from "../../../lib/PanelCells.ts"
import { useSecondClock } from "../../../lib/SecondClock.ts"
import { ToneStyle } from "../../../lib/ToneStyle.ts"

/** A panel value: its text, a tone as a dot and colour, and a countdown, "for 3 min" or "12 s ago" that runs live, the exact time on hover. */
const props = defineProps<{ cell: Cell | undefined }>()
const timed = computed(() => PanelCells.moment(props.cell) !== undefined)
// one timer for the whole page; only timed cells read it, so only they re-render each second
const now = useSecondClock()
const text = computed(() => PanelCells.text(props.cell, timed.value ? now.value.getTime() : 0))
const tone = computed(() => PanelCells.tone(props.cell))
</script>

<template>
  <span :class="['inline-flex min-w-0 items-baseline gap-1.5', ToneStyle.text(tone)]">
    <span v-if="tone" :class="['size-2 shrink-0 translate-y-[-1px] self-center rounded-full', ToneStyle.dot(tone)]" role="img" :aria-label="ToneStyle.label(tone)"></span>
    <!-- anywhere: a long name ("GetPowerFlowRealtimeData:") breaks instead of running out of a narrow card -->
    <span :class="['min-w-0 [overflow-wrap:anywhere]', timed ? 'tabular-nums' : '']" :title="PanelCells.moment(cell)">{{ text }}</span>
  </span>
</template>
