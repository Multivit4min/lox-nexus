<script setup lang="ts">
import type { SignalDto } from "@lox-nexus/api"
import { ArrowRight, Pencil, Trash2 } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { TransformDraft } from "../../lib/wires/TransformDraft.ts"
import type { WireLevel } from "../../lib/wires/WireHealth.ts"
import type { WireRow } from "../../stores/WireBoard.ts"
import VirtualTable from "../data/VirtualTable.vue"
import WireEnd from "./WireEnd.vue"

/** Wires with both ends, their transforms and why they do or don't carry values. */
defineProps<{ rows: WireRow[]; ownerName: (signal: SignalDto | undefined) => string; empty: string; busy?: boolean }>()
const emit = defineEmits<{ edit: [row: WireRow]; remove: [row: WireRow]; toggle: [row: WireRow, enabled: boolean] }>()

const steps = (row: WireRow) => row.wire.transforms.map(step => TransformDraft.summary(step)).join(" → ")

const DOT: Record<WireLevel, string> = {
  ok: "bg-emerald-500",
  idle: "bg-amber-500",
  off: "bg-muted-foreground/40",
  broken: "bg-destructive"
}
</script>

<template>
  <VirtualTable
    :rows="rows" :row-key="row => row.wire.id" :row-height="56" :empty="empty"
    columns="minmax(10rem,1.6fr) minmax(8rem,1.1fr) 1rem minmax(8rem,1.1fr) minmax(7rem,0.9fr) 3rem 4.5rem"
  >
    <template #header><span>Wire</span><span>From</span><span></span><span>To</span><span>Transforms</span><span>On</span><span></span></template>
    <template #row="{ row }">
      <span class="grid min-w-0 gap-0.5">
        <span class="flex min-w-0 items-center gap-2">
          <span class="size-2 shrink-0 rounded-full" :class="DOT[row.status.level]" role="img" :aria-label="row.status.level"></span>
          <span class="truncate font-medium" :title="row.wire.label">{{ row.wire.label || "unnamed" }}</span>
        </span>
        <span class="truncate text-xs" :class="row.status.level === 'broken' ? 'text-destructive' : 'text-muted-foreground'" :title="row.status.text">
          {{ row.status.text }}
        </span>
      </span>
      <WireEnd :signal="row.source" :owner="ownerName(row.source)" :stale="row.sourceStale" />
      <ArrowRight class="size-4 text-muted-foreground" />
      <WireEnd :signal="row.target" :owner="ownerName(row.target)" />
      <span class="truncate text-xs text-muted-foreground" :title="steps(row)">
        {{ steps(row) || "none" }}
      </span>
      <Switch :model-value="row.wire.enabled" :disabled="busy" :aria-label="`${row.wire.enabled ? 'Switch off' : 'Switch on'} ${row.wire.label}`" @update:model-value="v => emit('toggle', row, v === true)" />
      <span class="flex justify-end gap-0.5">
        <Button size="icon" variant="ghost" class="size-7" :title="`Edit ${row.wire.label}`" @click="emit('edit', row)"><Pencil class="size-4" /></Button>
        <Button size="icon" variant="ghost" class="size-7" :title="`Delete ${row.wire.label}`" @click="emit('remove', row)"><Trash2 class="size-4" /></Button>
      </span>
    </template>
  </VirtualTable>
</template>
