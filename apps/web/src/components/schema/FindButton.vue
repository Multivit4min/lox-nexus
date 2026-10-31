<script setup lang="ts">
import { inject, ref } from "vue"
import type { Discovered } from "@lox-nexus/plugin-sdk/wire"
import { Radar } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DISCOVER } from "../../lib/schema/DiscoverContext.ts"

/** Find on the network for a field: asks the plugin, lists what it found, and fills in the pick. */
const props = defineProps<{ field: string }>()
const emit = defineEmits<{ pick: [value: string] }>()
const context = inject(DISCOVER, undefined)
const open = ref(false)
const busy = ref(false)
const found = ref<Discovered>()
const problem = ref<string>()

async function search() {
  if (!context || busy.value) return
  busy.value = true
  problem.value = undefined
  found.value = undefined
  try {
    found.value = await context.find(props.field)
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

function pick(value: string) {
  emit("pick", value)
  open.value = false
}
</script>

<template>
  <Popover v-if="context" v-model:open="open" @update:open="value => value && search()">
    <PopoverTrigger as-child>
      <Button type="button" variant="outline" class="shrink-0" title="Find on the network"><Radar class="size-4" /> Find</Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-80 p-2">
      <p v-if="busy" class="p-2 text-sm text-muted-foreground" role="status">Searching the network…</p>
      <p v-else-if="problem" class="p-2 text-sm text-destructive">{{ problem }}</p>
      <p v-else-if="found?.length === 0" class="p-2 text-sm text-muted-foreground">Nothing found. Is it on the same network as Nexus?</p>
      <ul v-else-if="found" class="grid gap-1">
        <li v-for="entry in found" :key="entry.value">
          <button type="button" class="grid w-full gap-0.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" @click="pick(entry.value)">
            <span class="font-medium">{{ entry.label }}</span>
            <span class="truncate text-xs text-muted-foreground">{{ entry.detail ?? entry.value }}</span>
          </button>
        </li>
      </ul>
    </PopoverContent>
  </Popover>
</template>
