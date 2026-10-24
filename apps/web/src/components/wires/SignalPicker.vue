<script setup lang="ts">
import { computed, ref } from "vue"
import type { SignalDto } from "@lox-nexus/api"
import { ChevronsUpDown } from "@lucide/vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TextFilter } from "../../lib/TextFilter.ts"
import { WireTypes } from "../../lib/wires/WireTypes.ts"

/**
 * Picks one signal out of possibly thousands: search by name, owner, topic or type. Signals whose
 * type converts to something useless for `valueType` are hidden until "all types" is ticked, and
 * `taken` targets (already fed by another wire) can't be picked. Keyboard: arrows move through
 * the list, Enter in the search picks the first match.
 */
const props = defineProps<{
  id: string
  /** what is picked, e.g. "Source"; names the button and the list for screen readers */
  label: string
  signals: SignalDto[]
  /** the type at the other end of the wire; undefined while that end isn't chosen */
  valueType?: string
  ownerName: (signal: SignalDto) => string
  taken?: ReadonlyMap<string, string>
  placeholder: string
}>()
const selected = defineModel<string>({ required: true })

const SHOWN = 100
const open = ref(false)
const query = ref("")
const list = ref<HTMLElement>()
const allTypes = ref(false)

const current = computed(() => props.signals.find(signal => signal.id === selected.value))
const fitOf = (signal: SignalDto) => (props.valueType === undefined ? "same" : WireTypes.fit(props.valueType, signal.valueType))
const RANK = { same: 0, converts: 1, unusual: 2 }
const matches = computed(() => {
  const filter = new TextFilter(query.value)
  return props.signals
    .filter(signal => (allTypes.value || fitOf(signal) !== "unusual") && filter.matches(signal.label, signal.topic, signal.valueType, props.ownerName(signal)))
    .sort((a, b) => RANK[fitOf(a)] - RANK[fitOf(b)] || a.topic.localeCompare(b.topic))
})

const pickable = (signal: SignalDto) => !(props.taken?.has(signal.id) && signal.id !== selected.value)

function pick(signal: SignalDto) {
  selected.value = signal.id
  open.value = false
}

function pickFirst() {
  const first = matches.value.find(pickable)
  if (first) pick(first)
}

// the options are one Tab stop: arrows move between them, as in a native list
function step(event: KeyboardEvent, by: 1 | -1) {
  const options = [...(list.value?.querySelectorAll<HTMLButtonElement>("[role=option]:not(:disabled)") ?? [])]
  const at = options.indexOf(document.activeElement as HTMLButtonElement)
  const next = options[Math.min(Math.max(at + by, 0), options.length - 1)]
  if (next) {
    event.preventDefault()
    next.focus()
  }
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        :id="id" type="button" variant="outline" class="h-auto min-h-9 w-full justify-between py-1.5 text-left font-normal"
        :aria-label="`${label}: ${current ? `${current.label}, ${current.valueType}` : 'none chosen'}`"
      >
        <span v-if="current" class="grid min-w-0">
          <span class="truncate">{{ current.label }} <span class="text-xs text-muted-foreground">· {{ current.valueType }}</span></span>
          <span class="truncate font-mono text-xs text-muted-foreground">{{ current.topic }}</span>
        </span>
        <span v-else class="text-muted-foreground">{{ placeholder }}</span>
        <ChevronsUpDown class="size-4 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-[min(36rem,calc(100vw-2rem))] p-2">
      <div class="flex items-center gap-2 pb-2">
        <Input
          v-model="query" class="h-8 flex-1 text-sm" placeholder="Search name, owner, topic or type" type="search" :aria-label="`Search ${label.toLowerCase()}`"
          @keydown.enter.prevent="pickFirst" @keydown.down="step($event, 1)"
        />
        <label v-if="valueType" class="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox v-model="allTypes" /> all types
        </label>
      </div>
      <div ref="list" class="max-h-80 overflow-y-auto" role="listbox" :aria-label="label" @keydown.down="step($event, 1)" @keydown.up="step($event, -1)">
        <p v-if="matches.length === 0" class="px-2 py-4 text-center text-sm text-muted-foreground">
          No signal matches{{ valueType && !allTypes ? `. Tick "all types" to see signals that don't fit ${valueType}.` : "." }}
        </p>
        <button
          v-for="signal in matches.slice(0, SHOWN)" :key="signal.id" type="button" role="option" :aria-selected="signal.id === selected"
          tabindex="-1" :disabled="!pickable(signal)"
          class="grid w-full gap-0.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          :class="{ 'bg-accent': signal.id === selected }" @click="pick(signal)"
        >
          <span class="flex items-center gap-2">
            <span class="truncate font-medium">{{ signal.label }}</span>
            <Badge variant="outline" class="ml-auto shrink-0">{{ signal.valueType }}</Badge>
            <Badge v-if="fitOf(signal) !== 'same'" variant="secondary" class="shrink-0">{{ fitOf(signal) === "converts" ? "converted" : "unusual" }}</Badge>
          </span>
          <span class="truncate text-xs text-muted-foreground">
            {{ ownerName(signal) }} · <span class="font-mono">{{ signal.topic }}</span>
            <template v-if="!pickable(signal)"> · fed by "{{ taken?.get(signal.id) }}"</template>
          </span>
        </button>
        <p v-if="matches.length > SHOWN" class="px-2 py-2 text-xs text-muted-foreground">{{ matches.length - SHOWN }} more; search to narrow down.</p>
      </div>
    </PopoverContent>
  </Popover>
</template>
