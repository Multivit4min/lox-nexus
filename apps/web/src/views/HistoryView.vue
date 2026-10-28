<script setup lang="ts">
import { onMounted, ref } from "vue"
import type { HistorySettings, HistorySettingsInput, HistoryStatsDto, SelectionDto, SelectionModeDto, SelectionRulesUpdate, SignalDto } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AppContext } from "../AppContext.ts"
import HistoryRecordingCard from "../components/history/HistoryRecordingCard.vue"
import HistoryRetentionCard from "../components/history/HistoryRetentionCard.vue"
import HistoryRulesCard from "../components/history/HistoryRulesCard.vue"
import type { RuleOwner } from "../components/selection/OwnerRuleList.vue"

/** What the value history records and keeps, and what it takes. Charts are on each signal (the chart button). */
const context = AppContext.use()
const { history, recorded } = context
const settings = ref<HistorySettings>()
const selection = ref<SelectionDto>()
const stats = ref<HistoryStatsDto>()
const owners = ref<RuleOwner[]>([])
const signals = ref<SignalDto[]>([])
const failure = ref<string>()

async function attempt(work: () => Promise<unknown>) {
  try {
    await work()
    failure.value = undefined
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
  }
}

async function load() {
  const [s, sel, st, miniservers, instances, list] = await Promise.all([
    history.settings(), history.selection(), history.stats(), context.miniservers.list(), context.plugins.list(), context.bus.signals()
  ])
  ;[settings.value, selection.value, stats.value, signals.value] = [s, sel, st, list]
  owners.value = [
    ...miniservers.map(ms => ({ kind: "miniserver" as const, id: ms.id, label: ms.label || ms.slug })),
    ...instances.map(instance => ({ kind: "plugin" as const, id: instance.id, label: instance.label || instance.slug }))
  ]
}

// the recorded marks in signal lists follow every change made here
const changed = async () => {
  ;[stats.value] = await Promise.all([history.stats(), recorded.load()])
}
// throws, so the retention form can show what was wrong next to its fields
async function save(input: Partial<HistorySettingsInput>) {
  settings.value = await history.updateSettings(input)
  await changed()
}
const setMode = (mode: SelectionModeDto) => attempt(async () => {
  selection.value = await history.setMode(mode)
  await changed()
})
const setRules = (rules: SelectionRulesUpdate) => attempt(async () => {
  selection.value = await history.setRules(rules)
  await changed()
})

onMounted(() => attempt(load))
</script>

<template>
  <div class="mx-auto max-w-[64rem] space-y-4 p-6">
    <div>
      <h1 class="text-xl font-semibold">History</h1>
      <p class="text-sm text-muted-foreground">Past values of signals, for the charts behind the chart button in every signal list.</p>
    </div>
    <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
    <template v-if="settings && selection">
      <HistoryRecordingCard :settings="settings" :mode="selection.mode" :stats="stats" @enabled="on => attempt(() => save({ enabled: on }))" @mode="setMode" />
      <HistoryRulesCard :selection="selection" :owners="owners" :signals="signals" @rules="setRules" />
      <HistoryRetentionCard :settings="settings" :save="save" />
    </template>
  </div>
</template>
