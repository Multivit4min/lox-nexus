<script setup lang="ts">
import { computed } from "vue"
import type { HistorySettings, HistoryStatsDto, SelectionModeDto } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

/** Whether and what the history records, and what it takes so far and will take at this rate. */
const props = defineProps<{ settings: HistorySettings; mode: SelectionModeDto; stats?: HistoryStatsDto }>()
const emit = defineEmits<{ enabled: [on: boolean]; mode: [mode: SelectionModeDto] }>()

const megabytes = (bytes: number) => (bytes < 1e6 ? `${Math.max(0.1, bytes / 1e6).toFixed(1)} MB` : `${(bytes / 1e6).toFixed(bytes < 1e8 ? 1 : 0)} MB`)
const projection = computed(() => (props.stats?.projectedBytes ? megabytes(props.stats.projectedBytes) : undefined))
const MODES = [
  { mode: "selected", title: "Selected signals", text: "Only signals you switch on (the chart button in signal lists), and whole Miniservers or plugin instances below." },
  { mode: "all", title: "All signals", text: "Every signal, except those switched off. Grows fastest; check the estimate." }
] as const
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Recording</CardTitle>
      <CardDescription>Values are written in batches every few seconds into history.db, next to the configuration but separate from it.</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      <label class="flex items-center gap-2 text-sm"><Switch :model-value="settings.enabled" @update:model-value="v => emit('enabled', v)" /> Record history</label>
      <div class="grid gap-2 sm:grid-cols-2" role="group" aria-label="What is recorded">
        <button
          v-for="option in MODES" :key="option.mode" type="button" :aria-pressed="mode === option.mode" :disabled="!settings.enabled"
          class="grid gap-0.5 rounded-md border px-3 py-2 text-left text-sm disabled:opacity-50" :class="mode === option.mode ? 'border-primary ring-1 ring-primary' : 'hover:bg-muted'"
          @click="emit('mode', option.mode)"
        >
          <span class="font-medium">{{ option.title }}</span>
          <span class="text-xs text-muted-foreground">{{ option.text }}</span>
        </button>
      </div>
      <dl v-if="stats" class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt class="text-muted-foreground">Recorded</dt><dd>{{ stats.recorded }} signals{{ stats.enabled ? "" : " (once recording is switched on)" }}</dd>
        <dt class="text-muted-foreground">Stored</dt><dd>{{ megabytes(stats.fileBytes) }} for {{ stats.series }} signals</dd>
        <dt class="text-muted-foreground">Last hour</dt><dd>{{ stats.lastHour.raw.toLocaleString() }} changes</dd>
        <dt class="text-muted-foreground">Estimate</dt>
        <dd>{{ projection ? `about ${projection} once every level holds its full time at the last hour's rate (a year for levels kept forever)` : "once something was recorded" }}</dd>
      </dl>
      <Alert v-if="stats?.dropped" variant="destructive"><AlertDescription>{{ stats.dropped }} values were dropped because writing failed; see the server log.</AlertDescription></Alert>
    </CardContent>
  </Card>
</template>
