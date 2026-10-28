<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import type { SelectionDto, SelectionModeDto, SelectionRulesUpdate, SignalDto } from "@lox-nexus/api"
import type { WatchDeclaration } from "@lox-nexus/plugin-sdk/wire"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { AppContext } from "../../AppContext.ts"
import { SelectionRules } from "../../lib/SelectionRules.ts"
import { TextFilter } from "../../lib/TextFilter.ts"
import ListToolbar from "../data/ListToolbar.vue"
import VirtualTable from "../data/VirtualTable.vue"
import OwnerRuleList, { type RuleOwner } from "../selection/OwnerRuleList.vue"

/**
 * For a plugin that watches signals (an exporter): which signals of Nexus it receives. All of
 * them or chosen ones, whole Miniservers or plugin instances, and single signals ticked below.
 */
const props = defineProps<{ instanceId: string; declaration: WatchDeclaration }>()
const context = AppContext.use()
const selection = ref<SelectionDto>()
const signals = ref<SignalDto[]>([])
const owners = ref<RuleOwner[]>([])
const query = ref("")
const failure = ref<string>()
const MODES = [{ mode: "selected", title: "Chosen signals" }, { mode: "all", title: "All signals" }] as const

const visible = computed(() => {
  const filter = new TextFilter(query.value)
  return signals.value.filter(s => filter.matches(s.label, s.topic))
})
const watched = (signal: SignalDto) => (selection.value ? SelectionRules.includes(selection.value, signal) : false)

async function attempt(work: () => Promise<unknown>) {
  try {
    await work()
    failure.value = undefined
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
  }
}

const setMode = (mode: SelectionModeDto) => attempt(async () => (selection.value = await context.selections.setMode(props.instanceId, mode)))
const setRules = (rules: SelectionRulesUpdate) => attempt(async () => (selection.value = await context.selections.setRules(props.instanceId, rules)))
// a tick sets the signal's own rule; unticking removes it when that already leaves it out
function toggle(signal: SignalDto, on: boolean) {
  const withoutRule = { ...selection.value!, rules: selection.value!.rules.filter(r => !("signalId" in r.target && r.target.signalId === signal.id)) }
  const include = SelectionRules.includes(withoutRule, signal) === on ? null : on
  void setRules([{ target: { signalId: signal.id }, include }])
}

onMounted(() => attempt(async () => {
  const [sel, list, miniservers, instances] = await Promise.all([
    context.selections.get(props.instanceId), context.bus.signals(), context.miniservers.list(), context.plugins.list()
  ])
  ;[selection.value, signals.value] = [sel, list]
  owners.value = [
    ...miniservers.map(ms => ({ kind: "miniserver" as const, id: ms.id, label: ms.label || ms.slug })),
    ...instances.map(i => ({ kind: "plugin" as const, id: i.id, label: i.label || i.slug }))
  ]
}))
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ declaration.label }}</CardTitle>
      <CardDescription>
        {{ declaration.description ? `${declaration.description}. ` : "" }}This plugin receives every value of the signals chosen here, also of other systems.
      </CardDescription>
    </CardHeader>
    <CardContent v-if="failure"><Alert variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert></CardContent>
    <CardContent v-if="selection" class="grid gap-4">
      <div class="flex flex-wrap gap-2" role="group" aria-label="Which signals">
        <Button v-for="option in MODES" :key="option.mode" size="sm" :variant="selection.mode === option.mode ? 'secondary' : 'outline'" :aria-pressed="selection.mode === option.mode" @click="setMode(option.mode)">
          {{ option.title }}
        </Button>
      </div>
      <OwnerRuleList :selection="selection" :owners="owners" all-label="All its signals" none-label="None of its signals" @rules="setRules" />
      <ListToolbar v-model="query" :shown="visible.length" :total="signals.length" placeholder="Search signals" />
      <VirtualTable :rows="visible" :row-key="s => s.id" columns="1.25rem minmax(8rem,1fr) minmax(10rem,2fr)" max-height="320px" empty="No signals match.">
        <template #header><span></span><span>Signal</span><span>Topic</span></template>
        <template #row="{ row }">
          <Checkbox :model-value="watched(row)" :aria-label="`Send ${row.label}`" @update:model-value="v => toggle(row, v === true)" />
          <span class="truncate font-medium" :title="row.label">{{ row.label }}</span>
          <span class="truncate font-mono text-xs text-muted-foreground" :title="row.topic">{{ row.topic }}</span>
        </template>
      </VirtualTable>
    </CardContent>
  </Card>
</template>
