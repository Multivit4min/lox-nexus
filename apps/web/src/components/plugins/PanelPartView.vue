<script setup lang="ts">
import type { PanelPart } from "@lox-nexus/plugin-sdk/wire"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

/** One part of a plugin's panel: key-value pairs, a table, or JSON. */
defineProps<{ part: PanelPart }>()
</script>

<template>
  <dl v-if="part.type === 'keyValue'" class="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-6 gap-y-1.5 text-sm">
    <template v-for="item in part.items" :key="item.label">
      <dt class="text-muted-foreground">{{ item.label }}</dt>
      <dd class="break-words">{{ item.value }}</dd>
    </template>
  </dl>
  <div v-else-if="part.type === 'table'" class="max-h-96 overflow-auto">
    <Table>
      <TableHeader><TableRow><TableHead v-for="column in part.columns" :key="column">{{ column }}</TableHead></TableRow></TableHeader>
      <TableBody>
        <TableRow v-for="(row, i) in part.rows" :key="i"><TableCell v-for="(cell, j) in row" :key="j">{{ cell }}</TableCell></TableRow>
      </TableBody>
    </Table>
  </div>
  <pre v-else class="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{{ JSON.stringify(part.data, null, 2) }}</pre>
</template>
