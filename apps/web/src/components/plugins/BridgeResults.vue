<script setup lang="ts">
import { computed } from "vue"
import type { BridgeResultDto } from "@lox-nexus/api"
import { CircleAlert, CircleCheck } from "@lucide/vue"
import { Button } from "@/components/ui/button"

/**
 * What a bridge request did per signal: the Loxone signal it got, or why it failed and what of it
 * couldn't be removed again. `labels` are the requested signals' names, in request order (the
 * server only knows the id of an existing signal it can't find).
 */
const props = defineProps<{ results: BridgeResultDto[]; labels: string[] }>()
const emit = defineEmits<{ close: [] }>()
const failed = computed(() => props.results.filter(r => !r.ok).length)
const clean = computed(() => props.results.every(r => r.ok || !r.leftover?.length))
</script>

<template>
  <div class="grid min-w-0 gap-4">
    <p class="text-sm">
      {{ results.length - failed }} connected<template v-if="failed">, {{ failed }} failed.{{ clean ? " Nothing was created for those." : "" }}</template>
    </p>
    <ul class="max-h-[50vh] divide-y overflow-y-auto rounded-md border text-sm">
      <li v-for="(result, i) in results" :key="i" class="flex items-start gap-2 px-3 py-2">
        <template v-if="result.ok">
          <CircleCheck class="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="connected" />
          <span class="min-w-0">
            <span class="font-medium">{{ result.signal.label }}</span>
            <span class="text-muted-foreground"> · packet id </span><span class="font-mono">{{ result.loxone.packetId }}</span>
            <span class="block truncate font-mono text-xs text-muted-foreground" :title="result.loxone.topic">{{ result.loxone.topic }}</span>
          </span>
        </template>
        <template v-else>
          <CircleAlert class="mt-0.5 size-4 shrink-0 text-destructive" aria-label="failed" />
          <span class="min-w-0">
            <span class="font-medium">{{ labels[i] ?? result.label }}</span>: {{ result.error }}
            <span v-if="result.leftover?.length" class="block text-xs text-destructive">Couldn't be removed again: {{ result.leftover.join(", ") }}</span>
          </span>
        </template>
      </li>
    </ul>
    <div class="flex justify-end"><Button @click="emit('close')">Close</Button></div>
  </div>
</template>
