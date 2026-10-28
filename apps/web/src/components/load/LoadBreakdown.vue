<script setup lang="ts">
import { computed } from "vue"
import type { LoadBreakdownDto } from "@lox-nexus/api"
import { LoadShare } from "../../lib/LoadShare.ts"

/**
 * What the current load is made of. The signal list only shows the signals' part; everything else
 * belongs to no signal, which is why the shares there add up to less than the total.
 */
const props = defineProps<{ breakdown: LoadBreakdownDto; windowSeconds: number }>()

const rows = computed(() => {
  const { signals, unconfigured, otherTargets, encrypted, protocol, recentlyChanged } = props.breakdown
  return [
    { label: "Signals (their shares are in the signal list)", percent: signals },
    { label: "Packets without a signal (see Discovered)", percent: unconfigured },
    { label: "The Miniserver's packets for other targets on this port", percent: otherTargets },
    { label: "Encrypted packets Nexus can't read (no password set)", percent: encrypted },
    { label: "Status heartbeat and encryption handshakes", percent: protocol },
    { label: `Signals deleted or changed in the last ${props.windowSeconds / 60} minutes`, percent: recentlyChanged }
  ].filter((row, i) => i === 0 || row.percent > 0)
})
</script>

<template>
  <div class="space-y-1">
    <h4 class="text-xs font-medium">What it's made of</h4>
    <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-xs">
      <template v-for="row in rows" :key="row.label">
        <dt class="text-muted-foreground">{{ row.label }}</dt>
        <dd class="text-right tabular-nums">{{ LoadShare.format(row.percent) }}</dd>
      </template>
    </dl>
  </div>
</template>
