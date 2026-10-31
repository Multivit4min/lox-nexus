<script setup lang="ts">
import { onMounted, ref } from "vue"
import type { AccessTokenDto } from "@lox-nexus/api"
import { Plus, Trash2 } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AppContext } from "../../AppContext.ts"
import CreateTokenDialog from "./CreateTokenDialog.vue"

/**
 * Your access tokens for AI agents (MCP): what each may do and when it was last used, with
 * Revoke. They don't expire; changing your password ends all of them.
 */
const emit = defineEmits<{ changed: [] }>()
const api = AppContext.use().tokens
const tokens = ref<AccessTokenDto[]>([])
const failure = ref<string>()
const creating = ref(false)

async function load() {
  try {
    tokens.value = await api.list()
    failure.value = undefined
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
  }
}

async function revoke(token: AccessTokenDto) {
  if (!confirm(`Revoke "${token.name}"? An agent using it is refused from now on.`)) return
  try {
    await api.revoke(token.id)
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
  }
  await load()
  emit("changed")
}

async function created() {
  await load()
  emit("changed")
}

const when = (at: number | undefined) => (at === undefined ? "never" : new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }))
onMounted(load)
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row flex-wrap items-start justify-between gap-3">
      <div class="space-y-1.5">
        <CardTitle>Access tokens</CardTitle>
        <CardDescription>For AI agents that work with Nexus over MCP, as you. They don't expire; changing your password ends all of them.</CardDescription>
      </div>
      <Button size="sm" @click="creating = true"><Plus class="size-4" /> Create token</Button>
    </CardHeader>
    <CardContent class="space-y-3">
      <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
      <p v-if="!tokens.length" class="text-sm text-muted-foreground">You have no access tokens.</p>
      <ul v-else class="divide-y rounded-md border text-sm">
        <li v-for="token in tokens" :key="token.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
          <span class="min-w-40 flex-1 font-medium">{{ token.name }}</span>
          <span class="flex gap-1">
            <Badge v-for="scope in token.scopes" :key="scope" :variant="scope === 'operate' ? 'destructive' : 'secondary'">{{ scope }}</Badge>
          </span>
          <span class="text-xs text-muted-foreground">created {{ when(token.createdAt) }}</span>
          <span class="text-xs text-muted-foreground">last used {{ when(token.lastUsedAt) }}</span>
          <Button size="sm" variant="outline" class="text-destructive" @click="revoke(token)"><Trash2 class="size-4" /> Revoke</Button>
        </li>
      </ul>
    </CardContent>
    <CreateTokenDialog v-model:open="creating" @created="created" />
  </Card>
</template>
