<script setup lang="ts">
import type { SignalDto } from "@lox-nexus/api"
import ValueText from "../ValueText.vue"

/** One end of a wire in a list: the signal's name, its owner and its current value. */
defineProps<{ signal?: SignalDto; owner: string }>()
</script>

<template>
  <span class="grid min-w-0 gap-0.5">
    <span class="truncate" :title="signal?.topic">{{ signal?.label ?? "missing signal" }}</span>
    <span class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span class="truncate">{{ owner }}</span>
      <ValueText v-if="signal?.current?.value" :value="signal.current.value" />
    </span>
  </span>
</template>
