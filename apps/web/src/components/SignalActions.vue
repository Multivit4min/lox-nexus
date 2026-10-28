<script setup lang="ts">
import { Cable, ChartLine, Lock, Pencil, Trash2, Unlock } from "@lucide/vue"
import { Button } from "@/components/ui/button"

/**
 * The buttons at the end of a signal row: history, edit, new wire (with `wirable`), force or
 * release, delete. The history button is highlighted while the signal is recorded.
 */
defineProps<{ label: string; forced: boolean; disabled?: boolean; wirable?: boolean; recorded?: boolean }>()
const emit = defineEmits<{ history: []; edit: []; wire: []; force: []; release: []; remove: [] }>()
</script>

<template>
  <span class="flex justify-end gap-0.5">
    <Button
      size="icon" variant="ghost" class="size-7" :class="recorded ? 'text-[var(--viz-series)]' : ''"
      :title="recorded ? `History of ${label} (recorded)` : `History of ${label} (not recorded)`" @click="emit('history')"
    >
      <ChartLine class="size-4" />
    </Button>
    <Button size="icon" variant="ghost" class="size-7" :title="`Edit ${label}`" :disabled="disabled" @click="emit('edit')"><Pencil class="size-4" /></Button>
    <Button v-if="wirable" size="icon" variant="ghost" class="size-7" :title="`New wire with ${label}`" :disabled="disabled" @click="emit('wire')">
      <Cable class="size-4" />
    </Button>
    <Button
      v-if="forced" size="icon" variant="ghost" class="size-7 text-amber-600 dark:text-amber-400" :title="`Release ${label}: back to the last received value`"
      :disabled="disabled" @click="emit('release')"
    >
      <Unlock class="size-4" />
    </Button>
    <Button v-else size="icon" variant="ghost" class="size-7" :title="`Force ${label}`" :disabled="disabled" @click="emit('force')"><Lock class="size-4" /></Button>
    <Button size="icon" variant="ghost" class="size-7" :title="`Delete ${label}`" :disabled="disabled" @click="emit('remove')"><Trash2 class="size-4" /></Button>
  </span>
</template>
