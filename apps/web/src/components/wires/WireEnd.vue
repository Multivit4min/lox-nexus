<script setup lang="ts">
import type { SignalDto, StaleSignalDto } from "@lox-nexus/api"
import StaleBadge from "../StaleBadge.vue"
import ValueText from "../ValueText.vue"

/** One end of a wire in a list: the signal's name, its owner and its current value, marked when the source went quiet. */
defineProps<{ signal?: SignalDto; owner: string; stale?: StaleSignalDto | undefined }>()
</script>

<template>
  <span class="grid min-w-0 gap-0.5">
    <span class="truncate" :title="signal?.topic">{{ signal?.label ?? "missing signal" }}</span>
    <span class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span class="truncate">{{ owner }}</span>
      <StaleBadge :stale="stale" :limit-min="signal?.staleAfterMin" />
      <ValueText v-if="signal?.current?.value" :value="signal.current.value" :unit="signal.unit" :decimals="signal.decimals" />
    </span>
  </span>
</template>
