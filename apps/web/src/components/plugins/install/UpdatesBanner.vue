<script setup lang="ts">
import { computed } from "vue"
import { RouterLink } from "vue-router"
import { RefreshCw } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { AppContext } from "../../../AppContext.ts"

/**
 * "3 plugin updates available": the ones from the local repository update with one button; git
 * plugins are named, and update on their cards (their source asks for trust again).
 */
const emit = defineEmits<{ updateAll: [ids: string[]] }>()
const { updates } = AppContext.use()
const git = computed(() => updates.state.value.updates.filter(update => update.source === "git"))
const names = (list: Array<{ name: string }>) => list.map(update => update.name).join(", ")
</script>

<template>
  <div v-if="updates.count.value" class="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
    <RefreshCw class="size-4 shrink-0 text-primary" />
    <span class="min-w-0 flex-1">
      <span class="font-medium">{{ updates.count.value }} plugin update{{ updates.count.value === 1 ? "" : "s" }} available</span>
      <span v-if="updates.local.value.length" class="text-muted-foreground">: {{ names(updates.local.value) }}</span>
      <span v-if="git.length" class="block text-xs text-muted-foreground">
        New commits for {{ names(git) }}: update on the <RouterLink :to="{ name: 'plugin-packages' }" class="underline">Installed</RouterLink> tab.
      </span>
    </span>
    <Button v-if="updates.local.value.length" size="sm" @click="emit('updateAll', updates.local.value.map(update => update.id))">
      {{ updates.local.value.length === 1 ? `Update ${updates.local.value[0]!.name}` : "Update all" }}
    </Button>
  </div>
</template>
