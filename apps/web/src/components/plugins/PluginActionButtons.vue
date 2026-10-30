<script setup lang="ts">
import { computed, ref } from "vue"
import type { ActionDescription } from "@lox-nexus/plugin-sdk/wire"
import { Zap } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import PluginActionDialog from "./PluginActionDialog.vue"

/**
 * A button per action the plugin declares for the toolbar, e.g. "Pair device"; those placed in the
 * panel get their buttons there. Actions need the plugin running. `open()` runs any of them from
 * elsewhere (a panel's button) with its input filled in.
 */
const props = defineProps<{ instanceId: string; actions: ActionDescription[]; running: boolean }>()
const emit = defineEmits<{ done: [] }>()
const current = ref<{ action: ActionDescription; prefill?: Record<string, unknown> }>()
const dialogOpen = ref(false)
const title = computed(() => (props.running ? undefined : "Actions need the plugin running"))
const toolbar = computed(() => props.actions.filter(action => action.placement !== "panel"))

function open(id: string, prefill?: Record<string, unknown>) {
  const action = props.actions.find(candidate => candidate.id === id)
  if (!action) return
  current.value = { action, ...(prefill ? { prefill } : {}) }
  dialogOpen.value = true
}
defineExpose({ open })
</script>

<template>
  <Button v-for="action in toolbar" :key="action.id" variant="outline" size="sm" :disabled="!running" :title="title ?? action.description" @click="open(action.id)">
    <Zap class="size-4" /> {{ action.label }}
  </Button>
  <PluginActionDialog
    v-if="current" v-model:open="dialogOpen" :instance-id="instanceId" :action="current.action" :prefill="current.prefill" @done="emit('done')"
  />
</template>
