<script setup lang="ts">
import { useEventListener } from "@vueuse/core"
import { onUnmounted, ref, watch } from "vue"
import type { PluginActionResultDto } from "@lox-nexus/api"
import type { Panel, PluginDescription, RowAction } from "@lox-nexus/plugin-sdk/wire"
import { X } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AppContext } from "../../AppContext.ts"
import type { PluginEventHub } from "../../lib/PluginEventHub.ts"
import { VisiblePolling } from "../../lib/VisiblePolling.ts"
import PanelCard from "./PanelCard.vue"
import PanelPartView from "./PanelPartView.vue"

/**
 * A running plugin's panel: asked for every 3 s, or, for a plugin that says when it changed
 * (`panelPush`), when it says so and every 30 s. Its switches and instant buttons run at once and
 * say what happened above it; its other buttons open the action's dialog (`open`).
 */
const props = defineProps<{ instanceId: string; running: boolean; description?: PluginDescription; events: PluginEventHub }>()
const emit = defineEmits<{ open: [action: string, input?: Record<string, unknown>] }>()
const api = AppContext.use().plugins

const panel = ref<Panel | null>(null)
const loading = ref(false)
const busy = ref(false)
const outcome = ref<{ ok: boolean; answer: PluginActionResultDto }>()
let fetchedAt = 0
let latest = 0
let stale = false

// a failing answer keeps the last panel; a stopped plugin has none. A poll, a push and the reload
// after an action may overlap: only the latest request's answer is shown
async function load() {
  const request = ++latest
  if (!props.running) return void (panel.value = null)
  fetchedAt = Date.now()
  const answer = await api.panel(props.instanceId).catch(() => panel.value)
  if (request === latest) panel.value = answer
}

async function refresh() {
  loading.value = true
  await load()
  loading.value = false
}

const due = () => !props.description?.panelPush || Date.now() - fetchedAt >= 30_000
VisiblePolling.use(() => (due() ? load() : Promise.resolve()), 3000)
watch(() => props.running, () => void load(), { immediate: true })
// a hidden tab costs the server nothing: a push there only marks the panel for when it is shown
onUnmounted(props.events.on(event => {
  if (event.type !== "plugin-panel" || event.instanceId !== props.instanceId) return
  if (document.hidden) stale = true
  else void load()
}))
useEventListener(document, "visibilitychange", () => {
  if (document.hidden || !stale) return
  stale = false
  void load()
})

async function run(button: RowAction) {
  const action = props.description?.actions?.find(candidate => candidate.id === button.action)
  if (!action) return
  if (!button.instant && !button.switch) return emit("open", action.id, button.input)
  if (busy.value || (action.confirm && !confirm(action.confirm))) return
  busy.value = true
  try {
    outcome.value = { ok: true, answer: await api.action(props.instanceId, action.id, button.input ?? {}) }
    if (!outcome.value.answer.message && !outcome.value.answer.panel) outcome.value.answer.message = `${action.label}: done`
  } catch (error) {
    outcome.value = { ok: false, answer: { message: error instanceof Error ? error.message : String(error) } }
  } finally {
    busy.value = false
    await load()
  }
}
</script>

<template>
  <Alert v-if="outcome" :variant="outcome.ok ? 'default' : 'destructive'" class="relative pr-10">
    <AlertDescription class="grid gap-2">
      <span v-if="outcome.answer.message" class="whitespace-pre-wrap">{{ outcome.answer.message }}</span>
      <PanelPartView v-if="outcome.answer.panel" :part="outcome.answer.panel" />
    </AlertDescription>
    <Button size="icon" variant="ghost" class="absolute right-2 top-2 size-6" title="Dismiss" @click="outcome = undefined"><X class="size-4" /></Button>
  </Alert>
  <PanelCard v-if="panel" :panel="panel" :loading="loading || busy" :busy="busy" :actions="description?.actions" @refresh="refresh" @action="run" />
</template>
