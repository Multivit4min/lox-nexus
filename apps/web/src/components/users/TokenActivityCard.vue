<script setup lang="ts">
import { onMounted, ref } from "vue"
import type { McpActivityDto } from "@lox-nexus/api"
import { RefreshCw } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AppContext } from "../../AppContext.ts"
import { RelativeTime } from "../../lib/RelativeTime.ts"

/**
 * What your AI agents changed or did over MCP, newest first: the token, the tool, its arguments
 * (secret fields masked) and whether it worked. Reads aren't listed.
 */
const api = AppContext.use().tokens
const entries = ref<McpActivityDto[]>([])
const failure = ref<string>()
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    entries.value = await api.activity(50)
    failure.value = undefined
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

const variants = { ok: "secondary", refused: "outline", failed: "destructive" } as const
const exact = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })
onMounted(load)
defineExpose({ load })
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row flex-wrap items-start justify-between gap-3">
      <div class="space-y-1.5">
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>What your agents changed or did, newest first. Reads aren't listed; secret fields show as ‹secret›. Kept for 90 days.</CardDescription>
      </div>
      <Button size="sm" variant="outline" :disabled="loading" @click="load"><RefreshCw class="size-4" :class="{ 'animate-spin': loading }" /> Refresh</Button>
    </CardHeader>
    <CardContent class="space-y-3">
      <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
      <p v-if="!entries.length && !failure" class="text-sm text-muted-foreground">No changes by agents yet.</p>
      <ul v-else class="divide-y rounded-md border text-sm">
        <li v-for="(entry, index) in entries" :key="index" class="space-y-1 px-3 py-2">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="font-mono text-xs">{{ entry.tool }}</span>
            <Badge :variant="variants[entry.outcome]">{{ entry.outcome }}</Badge>
            <span class="text-xs text-muted-foreground">{{ entry.tokenName }}</span>
            <span class="ml-auto text-xs text-muted-foreground" :title="exact(entry.at)">{{ RelativeTime.ago(entry.at, Date.now()) }}</span>
          </div>
          <p v-if="entry.detail" class="text-xs text-muted-foreground">{{ entry.detail }}</p>
          <details class="text-xs">
            <summary class="cursor-pointer text-muted-foreground">Arguments</summary>
            <pre class="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono">{{ entry.input }}</pre>
          </details>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>
