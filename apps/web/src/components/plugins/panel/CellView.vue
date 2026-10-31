<script setup lang="ts">
import { computed } from "vue"
import type { Cell } from "@lox-nexus/plugin-sdk/wire"
import { PanelCells } from "../../../lib/PanelCells.ts"
import { useSecondClock } from "../../../lib/SecondClock.ts"
import { ToneStyle } from "../../../lib/ToneStyle.ts"

/** A panel value: its text, a tone as a dot and colour, and a countdown or "for 3 min" that runs live. */
const props = defineProps<{ cell: Cell | undefined }>()
const timed = computed(() => typeof props.cell === "object" && (props.cell.until !== undefined || props.cell.since !== undefined))
// one timer for the whole page; only timed cells read it, so only they re-render each second
const now = useSecondClock()
const text = computed(() => PanelCells.text(props.cell, timed.value ? now.value.getTime() : 0))
const tone = computed(() => PanelCells.tone(props.cell))
</script>

<template>
  <span :class="['inline-flex items-baseline gap-1.5 break-words', ToneStyle.text(tone)]">
    <span v-if="tone" :class="['size-2 shrink-0 translate-y-[-1px] self-center rounded-full', ToneStyle.dot(tone)]" role="img" :aria-label="ToneStyle.label(tone)"></span>
    <span :class="timed ? 'tabular-nums' : ''">{{ text }}</span>
  </span>
</template>
