<script setup lang="ts">
import type { RowAction } from "@lox-nexus/plugin-sdk/wire"
import { Zap } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

/**
 * A plugin's button for an action: a switch when the plugin gives a state, else a button (with a
 * bolt where it runs at once). Clicking or flipping only asks the page to run it.
 */
defineProps<{ action: RowAction; label: string; disabled?: boolean }>()
const emit = defineEmits<{ run: [action: RowAction] }>()
</script>

<template>
  <label v-if="action.switch" class="inline-flex items-center gap-2 text-sm">
    <Switch :model-value="action.switch.checked" :disabled="disabled" :aria-label="label" @update:model-value="() => emit('run', action)" />
    <span v-if="action.label" class="text-muted-foreground">{{ action.label }}</span>
  </label>
  <Button v-else size="sm" variant="outline" class="h-7" :disabled="disabled" @click="emit('run', action)">
    <Zap v-if="action.instant" class="size-3.5" /> {{ label }}
  </Button>
</template>
