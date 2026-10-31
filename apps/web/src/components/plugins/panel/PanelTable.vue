<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { Cell, RowAction } from "@lox-nexus/plugin-sdk/wire"
import { ArrowDown, ArrowUp, Search } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PanelCells } from "../../../lib/PanelCells.ts"
import ActionControl from "./ActionControl.vue"
import CellView from "./CellView.vue"

/**
 * A plugin's table: sortable by any column (numbers as numbers), with a search box once it is
 * longer than a few rows, and pages of 25. Row buttons and switches ask the page to run their action.
 */
const props = defineProps<{ columns: string[]; rows: Cell[][]; rowActions?: RowAction[][]; labelOf: (action: RowAction) => string; busy?: boolean }>()
const emit = defineEmits<{ action: [action: RowAction] }>()

const PAGE = 25
const query = ref("")
const sort = ref<{ column: number; descending: boolean }>()
const page = ref(0)

// row indexes, so each row keeps its own buttons through searching and sorting
const shown = computed(() => {
  const indexes = props.rows.map((_, i) => i).filter(i => !query.value || PanelCells.matches(props.rows[i]!, query.value))
  const by = sort.value
  if (by) indexes.sort((a, b) => PanelCells.compare(props.rows[a]![by.column], props.rows[b]![by.column]) * (by.descending ? -1 : 1))
  return indexes
})
const pages = computed(() => Math.max(1, Math.ceil(shown.value.length / PAGE)))
const visible = computed(() => shown.value.slice(page.value * PAGE, (page.value + 1) * PAGE))
// a new search starts at its first page; fewer rows keep the page, as far as it still exists
watch(query, () => (page.value = 0))
watch(() => props.rows.length, () => (page.value = Math.min(page.value, pages.value - 1)))

function sortBy(column: number) {
  const current = sort.value
  sort.value = current?.column !== column ? { column, descending: false } : current.descending ? undefined : { column, descending: true }
}
</script>

<template>
  <div class="grid gap-2">
    <div v-if="rows.length > 8" class="relative max-w-xs">
      <Search class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="query" class="h-8 pl-7" placeholder="Search" aria-label="Search the table" />
    </div>
    <div class="max-h-[32rem] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead v-for="(column, j) in columns" :key="column" :aria-sort="sort?.column === j ? (sort.descending ? 'descending' : 'ascending') : 'none'">
              <button type="button" class="inline-flex items-center gap-1 hover:text-foreground" @click="sortBy(j)">
                {{ column }}
                <ArrowUp v-if="sort?.column === j && !sort.descending" class="size-3" />
                <ArrowDown v-if="sort?.column === j && sort.descending" class="size-3" />
              </button>
            </TableHead>
            <TableHead v-if="rowActions" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="i in visible" :key="i">
            <TableCell v-for="(cell, j) in rows[i]" :key="j"><CellView :cell="cell" /></TableCell>
            <TableCell v-if="rowActions" class="whitespace-nowrap text-right">
              <span class="inline-flex flex-wrap justify-end gap-2">
                <ActionControl v-for="(action, k) in rowActions[i] ?? []" :key="k" :action="action" :label="labelOf(action)" :disabled="busy" @run="emit('action', action)" />
              </span>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
    <p v-if="query && shown.length === 0" class="text-sm text-muted-foreground">No row matches.</p>
    <div v-if="pages > 1" class="flex items-center justify-end gap-2 text-sm text-muted-foreground">
      <span>{{ page * PAGE + 1 }}–{{ Math.min((page + 1) * PAGE, shown.length) }} of {{ shown.length }}</span>
      <Button size="sm" variant="outline" class="h-7" :disabled="page === 0" @click="page--">Previous</Button>
      <Button size="sm" variant="outline" class="h-7" :disabled="page >= pages - 1" @click="page++">Next</Button>
    </div>
  </div>
</template>
