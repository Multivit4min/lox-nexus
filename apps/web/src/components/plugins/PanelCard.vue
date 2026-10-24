<script setup lang="ts">
import type { Panel } from "@lox-nexus/plugin-sdk/wire"
import { RefreshCw } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

/** The status view a plugin declares: key-value pairs, a table, or JSON. Plugins ship no UI code. */
defineProps<{ panel: Panel; loading?: boolean }>()
const emit = defineEmits<{ refresh: [] }>()
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between">
      <CardTitle>Status</CardTitle>
      <Button size="icon" variant="ghost" class="size-7" title="Refresh" :disabled="loading" @click="emit('refresh')"><RefreshCw class="size-4" /></Button>
    </CardHeader>
    <CardContent>
      <dl v-if="panel.type === 'keyValue'" class="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-6 gap-y-1.5 text-sm">
        <template v-for="item in panel.items" :key="item.label">
          <dt class="text-muted-foreground">{{ item.label }}</dt>
          <dd class="break-words">{{ item.value }}</dd>
        </template>
      </dl>
      <div v-else-if="panel.type === 'table'" class="max-h-96 overflow-auto">
        <Table>
          <TableHeader><TableRow><TableHead v-for="column in panel.columns" :key="column">{{ column }}</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="(row, i) in panel.rows" :key="i"><TableCell v-for="(cell, j) in row" :key="j">{{ cell }}</TableCell></TableRow>
          </TableBody>
        </Table>
      </div>
      <pre v-else class="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{{ JSON.stringify(panel.data, null, 2) }}</pre>
    </CardContent>
  </Card>
</template>
