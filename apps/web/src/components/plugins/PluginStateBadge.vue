<script setup lang="ts">
import { Badge } from "@/components/ui/badge"

/** A plugin instance's state; `title` explains it (the plugin's message, the last error). */
defineProps<{ state: string; title?: string }>()

const styles: Record<string, string> = {
  running: "bg-emerald-600 text-white",
  starting: "bg-sky-600 text-white",
  stopping: "bg-sky-600 text-white",
  degraded: "bg-amber-500 text-black",
  crashed: "bg-red-600 text-white",
  error: "bg-red-600 text-white",
  unavailable: "bg-zinc-500 text-white",
  stopped: "bg-muted text-muted-foreground"
}
</script>

<template>
  <Badge :class="styles[state] ?? styles.stopped" :title="title">{{ state }}</Badge>
</template>
