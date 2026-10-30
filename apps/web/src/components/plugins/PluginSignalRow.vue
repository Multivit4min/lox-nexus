<script setup lang="ts">
import type { PluginSignalDto } from "@lox-nexus/api"
import { CircleAlert, Lock } from "@lucide/vue"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { AppContext } from "../../AppContext.ts"
import type { LiveValues } from "../../stores/LiveValues.ts"
import SignalActions from "../SignalActions.vue"
import ValueText from "../ValueText.vue"
import WiredMark from "../WiredMark.vue"
import StaleBadge from "../StaleBadge.vue"

/** The cells of one plugin signal in the signals table; a signal inside a group is indented. */
const props = defineProps<{ row: PluginSignalDto; what: string; live: LiveValues; selected: boolean; inGroup?: boolean }>()
const emit = defineEmits<{ select: [selected: boolean]; history: []; edit: []; wire: []; force: []; release: []; remove: [] }>()
const { recorded, wired } = AppContext.use()
const forced = () => props.live.get(props.row.topic)?.flags?.forced === true
// an actuator's value is the last command it was sent, not something the device reported
const sentAt = () => {
  const message = props.live.get(props.row.topic)
  return props.row.kind === "actuator" && message ? `last sent ${new Date(message.ts).toLocaleString()}` : undefined
}
</script>

<template>
  <Checkbox :model-value="selected" :aria-label="`Select ${row.label}`" @update:model-value="v => emit('select', v === true)" />
  <span class="flex min-w-0 items-center gap-1.5" :class="inGroup && 'pl-5'">
    <CircleAlert v-if="row.error" class="size-4 shrink-0 text-destructive" :title="row.error" />
    <span class="truncate font-medium" :title="row.error ?? row.label">{{ row.label }}</span>
    <WiredMark :wires="wired.of(row.id)" />
  </span>
  <span><Badge variant="outline" :title="row.kind === 'sensor' ? 'reads from the device' : 'controls the device'">{{ row.kind }}</Badge></span>
  <span class="truncate text-muted-foreground" :title="`${row.capability} ${JSON.stringify(row.params)}`">{{ what }}</span>
  <span class="truncate font-mono text-xs" :title="row.topic">{{ row.topic }}</span>
  <span class="flex min-w-0 items-center gap-1.5" :title="sentAt()">
    <Lock v-if="forced()" class="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-label="forced" />
    <StaleBadge :stale="live.staleOf(row.topic)" :limit-min="row.staleAfterMin" />
    <span class="truncate"><ValueText :value="live.get(row.topic)?.value" :unit="row.unit" :decimals="row.decimals" /></span>
  </span>
  <SignalActions
    :label="row.label" :forced="forced()" :recorded="recorded.has(row.id)" wirable @history="emit('history')"
    @edit="emit('edit')" @wire="emit('wire')" @force="emit('force')" @release="emit('release')" @remove="emit('remove')"
  />
</template>
