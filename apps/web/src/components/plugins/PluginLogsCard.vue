<script setup lang="ts">
import { computed, ref } from "vue"
import type { PluginLogLineDto } from "@lox-nexus/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TextFilter } from "../../lib/TextFilter.ts"
import ListToolbar from "../data/ListToolbar.vue"

/** The instance's recent log lines, newest first; the server keeps about 200 in memory. */
const props = defineProps<{ lines: PluginLogLineDto[] }>()
const query = ref("")
const minimum = ref<"debug" | "info" | "warn">("info")
const RANK = { debug: 0, info: 1, warn: 2, error: 3 } as const
const COLOR = { debug: "text-muted-foreground", info: "", warn: "text-amber-600 dark:text-amber-400", error: "text-destructive" } as const

const visible = computed(() => {
  const filter = new TextFilter(query.value)
  return props.lines.filter(line => RANK[line.level] >= RANK[minimum.value] && filter.matches(line.message, line.data ?? "")).toReversed()
})
const time = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour12: false })
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Log</CardTitle>
      <CardDescription>What the plugin logged since the server started, newest first.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-3">
      <ListToolbar v-model="query" :shown="visible.length" :total="lines.length" placeholder="Search the log">
        <div class="flex gap-1">
          <button
            v-for="level in (['debug', 'info', 'warn'] as const)" :key="level" type="button"
            class="rounded-md px-2 py-1 text-xs" :class="minimum === level ? 'bg-secondary' : 'text-muted-foreground'" @click="minimum = level"
          >
            {{ level }}+
          </button>
        </div>
      </ListToolbar>
      <div class="max-h-80 overflow-auto rounded-md border font-mono text-xs">
        <p v-if="!visible.length" class="p-3 text-muted-foreground">Nothing logged.</p>
        <div v-for="(line, i) in visible" :key="i" class="flex gap-3 border-b px-3 py-1 last:border-b-0" :class="COLOR[line.level]">
          <span class="shrink-0 text-muted-foreground">{{ time(line.ts) }}</span>
          <span class="w-10 shrink-0 uppercase">{{ line.level }}</span>
          <span class="min-w-0 break-words">{{ line.message }}<span v-if="line.data" class="text-muted-foreground"> {{ line.data }}</span></span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
