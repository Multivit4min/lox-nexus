<script setup lang="ts">
import type { InstallOutcomeDto } from "@lox-nexus/api"
import { CircleCheck, Undo2 } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import PluginStateBadge from "../PluginStateBadge.vue"

/** After an install, update or rollback: the active version and each instance's state, and a way back to the version before. */
defineProps<{ outcome: InstallOutcomeDto }>()
const emit = defineEmits<{ rollback: [] }>()
</script>

<template>
  <div class="grid gap-3 text-sm">
    <p class="flex items-center gap-2 font-medium">
      <CircleCheck class="size-4 text-emerald-600" /> {{ outcome.plugin.name }} {{ outcome.plugin.active.version }} is active
    </p>
    <p v-if="outcome.plugin.shadowedByDevelopment" class="text-muted-foreground">
      A development copy with the same id runs instead, so the instances didn't change.
    </p>
    <ul v-if="outcome.instances.length" class="grid gap-1">
      <li v-for="instance in outcome.instances" :key="instance.id" class="grid gap-0.5">
        <span class="flex items-center gap-2"><PluginStateBadge :state="instance.state" /> {{ instance.label || instance.id }}</span>
        <span v-if="instance.lastError" class="pl-1 text-xs text-destructive">{{ instance.lastError }}</span>
      </li>
    </ul>
    <p v-else class="text-muted-foreground">No instance uses it yet; add one on the Instances tab.</p>
    <div v-if="outcome.plugin.previous">
      <Button size="sm" variant="outline" :disabled="!outcome.plugin.previous.available" :title="outcome.plugin.previous.problem" @click="emit('rollback')">
        <Undo2 class="size-4" /> Roll back to {{ outcome.plugin.previous.version }}
      </Button>
    </div>
  </div>
</template>
