<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import type { PluginLogLevelDto, PluginLogLineDto } from "@lox-nexus/api"
import { useNow } from "@vueuse/core"
import { Download } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { PluginApi } from "../../api/PluginApi.ts"
import { AppContext } from "../../AppContext.ts"
import { TextFilter } from "../../lib/TextFilter.ts"
import ListToolbar from "../data/ListToolbar.vue"

/**
 * The instance's recent log lines, newest first; the server keeps 200 in memory, 1000 while debug
 * lines are kept. Those only while the switch is on, for 15 minutes, so a chatty plugin can't push
 * the rest out for good.
 */
const props = defineProps<{ lines: PluginLogLineDto[]; instanceId: string }>()
const emit = defineEmits<{ changed: [] }>()
const api = AppContext.use().plugins
const query = ref("")
const minimum = ref<"debug" | "info" | "warn">("info")
const RANK = { debug: 0, info: 1, warn: 2, error: 3 } as const
const COLOR = { debug: "text-muted-foreground", info: "", warn: "text-amber-600 dark:text-amber-400", error: "text-destructive" } as const

const visible = computed(() => {
  const filter = new TextFilter(query.value)
  return props.lines.filter(line => RANK[line.level] >= RANK[minimum.value] && filter.matches(line.message, line.data ?? "")).toReversed()
})
const time = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour12: false })

// when debug logging ends, in this browser's time: counted from the answer, so a wrong clock doesn't matter
const endsAt = ref(0)
const error = ref("")
const now = useNow({ interval: 15_000 })
// the server ends debug logging by itself; the switch follows without asking it
const minutesLeft = computed(() => Math.max(0, Math.ceil((endsAt.value - now.value.getTime()) / 60_000)))
const debugOn = computed(() => minutesLeft.value > 0)

function apply(level: PluginLogLevelDto) {
  endsAt.value = level.level === "debug" ? Date.now() + (level.remainingMs ?? 0) : 0
}

onMounted(async () => {
  await api.logLevel(props.instanceId).then(apply, () => undefined)
})

async function toggle(on: boolean) {
  try {
    apply(await api.setLogLevel(props.instanceId, { level: on ? "debug" : "info" }))
    error.value = ""
    if (on) minimum.value = "debug"
    emit("changed")
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  }
}
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row flex-wrap items-start justify-between gap-3">
      <div class="space-y-1.5">
        <CardTitle>Log</CardTitle>
        <CardDescription>What the plugin logged since the server started, newest first.</CardDescription>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2" title="Keeps the plugin's debug lines for 15 minutes; it switches off by itself">
          <Switch id="plugin-debug" :model-value="debugOn" @update:model-value="value => toggle(value === true)" />
          <Label for="plugin-debug" class="text-sm font-normal">{{ debugOn ? `Debug: ${minutesLeft} min left` : "Debug for 15 min" }}</Label>
        </div>
        <Button as="a" variant="outline" size="sm" :href="PluginApi.logsDownloadUrl(instanceId)" download><Download class="size-4" /> Download</Button>
      </div>
    </CardHeader>
    <CardContent class="space-y-3">
      <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
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
