<script setup lang="ts">
import { Search } from "@lucide/vue"
import { Input } from "@/components/ui/input"

/** Search box, "x of y" count and a slot for filters and bulk actions, above a long list. */
defineProps<{ shown: number; total: number; placeholder?: string }>()
const query = defineModel<string>({ required: true })
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <div class="relative">
      <Search class="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="query" class="h-8 w-72 max-w-full pl-8 text-sm" :placeholder="placeholder ?? 'Search'" :aria-label="placeholder ?? 'Search'" type="search" />
    </div>
    <slot />
    <span class="ml-auto text-xs text-muted-foreground" style="font-variant-numeric: tabular-nums">
      {{ shown === total ? `${total.toLocaleString()} total` : `${shown.toLocaleString()} of ${total.toLocaleString()}` }}
    </span>
  </div>
</template>
