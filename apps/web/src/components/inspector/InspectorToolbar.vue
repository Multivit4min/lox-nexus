<script setup lang="ts">
import { ref } from "vue"
import { Pause, Play, Send, Trash } from "@lucide/vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { InspectorStore, MessageKind } from "../../stores/InspectorStore.ts"

/** Topic pattern (server-side), text and kind filters (client-side), pause, clear and inject. */
const props = defineProps<{ store: InspectorStore }>()
const emit = defineEmits<{ inject: [] }>()
const pattern = ref(props.store.state.pattern)
const kinds: MessageKind[] = ["state", "command", "result", "force", "release", "event"]
const connection = { open: "live", connecting: "connecting…", closed: "disconnected" }
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 border-b p-2">
    <form class="flex gap-2" @submit.prevent="store.follow(pattern)">
      <Input v-model="pattern" class="w-64 font-mono text-xs" placeholder="topic pattern, e.g. loxone/#" title="MQTT-style: + one level, # the rest" />
    </form>
    <Input :model-value="store.state.text" class="w-48 text-xs" placeholder="filter text" @update:model-value="text => store.setText(String(text))" />
    <div class="flex gap-1">
      <Button
        v-for="kind in kinds" :key="kind" size="sm" :variant="store.state.kinds.has(kind) ? 'secondary' : 'ghost'"
        class="h-7 px-2 text-xs" @click="store.toggleKind(kind)"
      >
        {{ kind }}
      </Button>
    </div>
    <div class="ml-auto flex items-center gap-2">
      <Badge v-if="store.state.dropped" variant="destructive" title="dropped by the server because the browser could not keep up">{{ store.state.dropped }} dropped</Badge>
      <Badge variant="outline">{{ connection[store.state.connection] }}</Badge>
      <Button size="sm" variant="outline" @click="store.setPaused(!store.state.paused)">
        <template v-if="store.state.paused"><Play class="size-4" /> Resume <span v-if="store.state.missed">(+{{ store.state.missed }})</span></template>
        <template v-else><Pause class="size-4" /> Pause</template>
      </Button>
      <Button size="sm" variant="ghost" title="Clear" @click="store.clear()"><Trash class="size-4" /></Button>
      <Button size="sm" variant="outline" @click="emit('inject')"><Send class="size-4" /> Inject</Button>
    </div>
  </div>
</template>
