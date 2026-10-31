<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { PluginStoreEntryDto } from "@lox-nexus/api"
import { ChevronDown, ChevronRight, RefreshCw, Trash2 } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppContext } from "../../AppContext.ts"
import { ByteSize } from "../../lib/ByteSize.ts"

/**
 * What the plugin saved with `this.store`, to look at: one row per key, its value on demand. It
 * can't be edited, only wiped as a whole: the server stops a running plugin, deletes everything and
 * starts it again, so the plugin never runs on half of its data. Opened from the instance menu.
 */
const props = defineProps<{ instanceId: string; label: string; state: string }>()
const open = defineModel<boolean>("open", { required: true })
const emit = defineEmits<{ changed: [] }>()
const api = AppContext.use().plugins
const entries = ref<PluginStoreEntryDto[]>([])
const expanded = ref<string>()
const value = ref<string>()
const busy = ref(false)
const error = ref<string>()
const total = computed(() => entries.value.reduce((sum, entry) => sum + entry.bytes, 0))

async function load() {
  try {
    entries.value = await api.store(props.instanceId)
    error.value = undefined
    if (expanded.value && !entries.value.some(entry => entry.key === expanded.value)) expanded.value = undefined
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  }
}

async function toggle(key: string) {
  if (expanded.value === key) return void (expanded.value = undefined)
  expanded.value = key
  value.value = undefined
  try {
    value.value = JSON.stringify((await api.storeValue(props.instanceId, key)).value, null, 2)
  } catch (failure) {
    value.value = failure instanceof Error ? failure.message : String(failure)
  }
}

async function clear() {
  const restart = props.state === "running" || props.state === "degraded" ? " It is stopped first and started again empty." : ""
  if (!confirm(`Delete everything ${props.label} saved (${entries.value.length} keys)?${restart} The plugin forgets what it kept between restarts, e.g. paired devices. This can't be undone.`)) return
  busy.value = true
  try {
    await api.clearStore(props.instanceId)
    expanded.value = undefined
    emit("changed")
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  } finally {
    busy.value = false
    await load()
  }
}

// read fresh each time it opens: a running plugin keeps writing
watch(open, opened => {
  if (!opened) return
  expanded.value = undefined
  void load()
}, { immediate: true })
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Stored data of {{ label }}</DialogTitle>
        <DialogDescription>
          What the plugin keeps between restarts: {{ entries.length }} {{ entries.length === 1 ? "key" : "keys" }}, {{ ByteSize.format(total) }}. Read only; it can only
          be cleared as a whole.
        </DialogDescription>
      </DialogHeader>
      <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      <p v-if="!entries.length && !error" class="text-sm text-muted-foreground">The plugin has saved nothing.</p>
      <ul v-else-if="entries.length" class="max-h-[55vh] divide-y overflow-auto rounded-md border text-sm">
        <li v-for="entry in entries" :key="entry.key">
          <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50" :aria-expanded="expanded === entry.key" @click="toggle(entry.key)">
            <component :is="expanded === entry.key ? ChevronDown : ChevronRight" class="size-4 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1 truncate font-mono text-xs" :title="entry.key">{{ entry.key }}</span>
            <span class="shrink-0 text-xs text-muted-foreground tabular-nums">{{ ByteSize.format(entry.bytes) }}</span>
          </button>
          <pre v-if="expanded === entry.key" class="max-h-80 overflow-auto bg-muted px-3 py-2 font-mono text-xs">{{ value ?? "Loading…" }}</pre>
        </li>
      </ul>
      <div class="flex justify-between gap-2">
        <Button size="sm" variant="ghost" :disabled="busy" @click="load"><RefreshCw class="size-4" /> Reload</Button>
        <Button variant="outline" size="sm" class="text-destructive" :disabled="busy || !entries.length" @click="clear"><Trash2 class="size-4" /> Clear all data</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
