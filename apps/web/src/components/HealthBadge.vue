<script setup lang="ts">
import type { MiniserverHealthDto } from "@lox-nexus/api"
import { Badge } from "@/components/ui/badge"

defineProps<{ health: MiniserverHealthDto | string }>()

const styles: Record<string, string> = {
  online: "bg-emerald-600 text-white",
  waiting: "bg-amber-500 text-black",
  stale: "bg-red-600 text-white",
  stopped: "bg-muted text-muted-foreground"
}
</script>

<template>
  <Badge :class="styles[health] ?? styles.stopped">{{ health }}</Badge>
</template>
