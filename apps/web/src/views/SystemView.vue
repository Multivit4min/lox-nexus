<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import type { DiagnosticsDto } from "@lox-nexus/api"
import { useIntervalFn } from "@vueuse/core"
import { Download } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AppContext } from "../AppContext.ts"
import { DiagnosticsApi } from "../api/DiagnosticsApi.ts"
import MetricChart from "../components/system/MetricChart.vue"
import SystemTiles from "../components/system/SystemTiles.vue"
import SystemTrends from "../components/system/SystemTrends.vue"
import { MessageText } from "../lib/MessageText.ts"
import { SystemCharts } from "../lib/system/SystemCharts.ts"

/**
 * Diagnostics for a long run: what Nexus and its plugin workers use, sampled by the server every
 * 30 s and kept for 48 h in memory; in the user menu. Reloads with every new sample.
 */
const api = AppContext.use().diagnostics
const HOUR = 3_600_000
const RANGES = [["1 h", HOUR], ["6 h", 6 * HOUR], ["24 h", 24 * HOUR], ["48 h", 48 * HOUR]] as const
const data = ref<DiagnosticsDto>()
const failure = ref<string>()
const range = ref<number>(6 * HOUR)

const latest = computed(() => data.value?.samples.at(-1))
const to = computed(() => latest.value?.ts ?? Date.now())
const charts = computed(() => SystemCharts.build(data.value?.samples ?? []))
// more than two intervals without a sample is a gap (a restart, a stalled process)
const gapMs = computed(() => (data.value?.intervalMs ?? 30_000) * 2.5)
const uptime = computed(() => {
  const hours = (to.value - (data.value?.startedAt ?? to.value)) / HOUR
  return hours >= 24 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(1)} h`
})

// only the samples since the last one: a full 48 h is megabytes, and serving it every 30 s would
// show up in the very figures this page reports
async function load() {
  try {
    const known = data.value
    const since = known?.samples.at(-1)?.ts
    const next = await api.get(since)
    // another start time means Nexus restarted with an empty ring: what this page has is gone
    if (!known || since === undefined || next.startedAt !== known.startedAt) data.value = since === undefined ? next : await api.get()
    else {
      const cutoff = (next.samples.at(-1)?.ts ?? since) - next.keepMs
      data.value = { ...next, samples: [...known.samples, ...next.samples].filter(sample => sample.ts > cutoff) }
    }
    failure.value = undefined
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
  }
}

onMounted(load)
useIntervalFn(() => document.visibilityState === "visible" && load(), 30_000)
</script>

<template>
  <div class="mx-auto max-w-[72rem] space-y-4 p-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">System</h1>
        <p class="text-sm text-muted-foreground">
          What Nexus and its plugins use, sampled every {{ (data?.intervalMs ?? 30_000) / 1000 }} s and kept for {{ (data?.keepMs ?? 48 * HOUR) / HOUR }} h in memory.
        </p>
        <p v-if="data" class="text-xs text-muted-foreground">
          Nexus {{ data.version }} · Node {{ data.node }} · {{ data.platform }} · started {{ MessageText.time(data.startedAt).slice(0, 8) }} ({{ uptime }})
        </p>
      </div>
      <Button as="a" variant="outline" size="sm" :href="DiagnosticsApi.CSV_URL" download><Download class="size-4" /> Download samples (CSV)</Button>
    </div>
    <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
    <template v-if="data">
      <SystemTiles v-if="latest" :sample="latest" />
      <p v-else class="text-sm text-muted-foreground">The first sample arrives within 30 seconds.</p>
      <Card>
        <CardHeader><CardTitle>Does memory stay flat?</CardTitle></CardHeader>
        <CardContent><SystemTrends :samples="data.samples" :interval-ms="data.intervalMs" /></CardContent>
      </Card>
      <Card>
        <CardHeader class="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Over time</CardTitle>
          <div class="flex gap-1" role="group" aria-label="Range">
            <Button v-for="[text, ms] in RANGES" :key="text" size="sm" class="h-8" :variant="range === ms ? 'secondary' : 'ghost'" :aria-pressed="range === ms" @click="range = ms">
              {{ text }}
            </Button>
          </div>
        </CardHeader>
        <CardContent class="grid gap-6 lg:grid-cols-2">
          <MetricChart v-for="chart in charts" :key="chart.id" :spec="chart" :from="to - range" :to="to" :gap-ms="gapMs" />
        </CardContent>
      </Card>
    </template>
  </div>
</template>
