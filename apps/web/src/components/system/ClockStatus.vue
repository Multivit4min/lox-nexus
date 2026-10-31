<script setup lang="ts">
import { computed } from "vue"
import { ClockOffset } from "../../lib/ClockOffset.ts"
import { useServerClock } from "../../lib/ServerClock.ts"
import { ToneStyle } from "../../lib/ToneStyle.ts"

/**
 * How far the server's clock is off from this browser's. Plugin pages correct their live times
 * for it; a large gap still means one of the clocks is wrong, which logs and history show.
 */
const { reading } = useServerClock()
const SECONDS_OK = 2
const off = computed(() => reading.value !== undefined && Math.abs(reading.value.offsetMs) >= SECONDS_OK * 1000)
const tone = computed(() => (reading.value === undefined ? "muted" : off.value ? "warn" : "ok"))
</script>

<template>
  <div class="grid gap-1 text-xs text-muted-foreground">
    <p class="flex items-center gap-1.5">
      <span :class="['size-2 rounded-full', ToneStyle.dot(tone)]" role="img" :aria-label="ToneStyle.label(tone)"></span>
      <span>
        Server clock: {{ reading ? ClockOffset.describe(reading) : "measuring…" }}
        <template v-if="reading">(± {{ Math.max(1, Math.round(reading.uncertaintyMs)) }} ms)</template>
      </span>
    </p>
    <p v-if="off">
      Live times on plugin pages are corrected for it. To fix the clock itself, turn on time sync (NTP) on the computer Nexus runs
      on, e.g. <code class="font-mono">timedatectl set-ntp true</code>: a Docker container always has its host's clock. Check this device's clock too.
    </p>
  </div>
</template>
