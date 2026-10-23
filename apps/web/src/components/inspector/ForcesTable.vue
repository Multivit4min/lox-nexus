<script setup lang="ts">
import { computed, ref } from "vue"
import type { ForceDto } from "@lox-nexus/api"
import { Unlock } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { TextFilter } from "../../lib/TextFilter.ts"
import ListToolbar from "../data/ListToolbar.vue"
import VirtualTable from "../data/VirtualTable.vue"
import ValueText from "../ValueText.vue"

/** Every active force, searchable by topic, user and reason. */
const props = defineProps<{ forces: ForceDto[] }>()
const emit = defineEmits<{ release: [topic: string] }>()
const query = ref("")
const visible = computed(() => {
  const filter = new TextFilter(query.value)
  return props.forces.filter(f => filter.matches(f.topic, f.by, f.reason))
})
const when = (ts: number) => new Date(ts).toLocaleString()
</script>

<template>
  <div class="space-y-2">
    <ListToolbar v-model="query" :shown="visible.length" :total="forces.length" placeholder="Search topic, user or reason" />
    <VirtualTable
      :rows="visible" :row-key="f => f.topic" columns="minmax(12rem,2fr) minmax(6rem,1fr) 6rem minmax(8rem,1.5fr) 10rem 10rem 6.5rem"
      max-height="calc(100vh - 14rem)" :empty="forces.length ? 'No force matches.' : 'Nothing is forced.'"
    >
      <template #header>
        <span>Topic</span><span>Value</span><span>By</span><span>Reason</span><span>Since</span><span>Until</span><span></span>
      </template>
      <template #row="{ row }">
        <span class="truncate font-mono text-xs" :title="row.topic">{{ row.topic }}</span>
        <span class="truncate"><ValueText :value="row.value" /></span>
        <span class="truncate">{{ row.by }}</span>
        <span class="truncate" :title="row.reason">{{ row.reason }}</span>
        <span class="truncate text-xs text-muted-foreground">{{ when(row.at) }}</span>
        <span class="truncate text-xs text-muted-foreground">{{ row.until ? when(row.until) : "until released" }}</span>
        <Button size="sm" variant="outline" class="h-7" @click="emit('release', row.topic)"><Unlock class="size-4" /> Release</Button>
      </template>
    </VirtualTable>
  </div>
</template>
