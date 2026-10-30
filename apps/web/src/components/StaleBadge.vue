<script setup lang="ts">
import { computed } from "vue"
import type { StaleSignalDto } from "@lox-nexus/api"
import { ClockAlert } from "@lucide/vue"

/** Marks a source that went quiet: its owner runs, but it sent no value for longer than its stale limit. */
const props = defineProps<{ stale?: StaleSignalDto | undefined; limitMin?: number | undefined }>()
const text = computed(() => {
  const last = props.stale?.lastSeen
  const since = last === undefined ? "no value since the server started" : `no value since ${new Date(last).toLocaleString()}`
  return props.limitMin ? `Stale: ${since} (limit ${props.limitMin} min)` : `Stale: ${since}`
})
</script>

<template>
  <ClockAlert v-if="stale" class="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" role="img" :aria-label="text"><title>{{ text }}</title></ClockAlert>
</template>
