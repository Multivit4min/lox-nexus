<script setup lang="ts">
import { defineAsyncComponent } from "vue"
import type { PanelPart, RowAction } from "@lox-nexus/plugin-sdk/wire"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// the encoder comes with it, so only panels that show a code load it
const QrCode = defineAsyncComponent(() => import("./QrCode.vue"))

/** One part of a plugin's panel: key-value pairs, a table (with buttons per row), JSON, or a QR code. */
defineProps<{ part: PanelPart }>()
const emit = defineEmits<{ action: [action: RowAction] }>()
</script>

<template>
  <dl v-if="part.type === 'keyValue'" class="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-6 gap-y-1.5 text-sm">
    <template v-for="item in part.items" :key="item.label">
      <dt class="text-muted-foreground">{{ item.label }}</dt>
      <dd class="break-words">{{ item.value }}</dd>
    </template>
  </dl>
  <p v-else-if="part.type === 'table' && part.rows.length === 0" class="text-sm text-muted-foreground">Nothing to show yet.</p>
  <div v-else-if="part.type === 'table'" class="max-h-96 overflow-auto">
    <Table>
      <TableHeader>
        <TableRow><TableHead v-for="column in part.columns" :key="column">{{ column }}</TableHead><TableHead v-if="part.rowActions" /></TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="(row, i) in part.rows" :key="i">
          <TableCell v-for="(cell, j) in row" :key="j">{{ cell }}</TableCell>
          <TableCell v-if="part.rowActions" class="text-right">
            <Button v-for="(action, k) in part.rowActions[i] ?? []" :key="k" size="sm" variant="outline" class="ml-2 h-7" @click="emit('action', action)">
              {{ action.label ?? action.action }}
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
  <QrCode v-else-if="part.type === 'qr'" :data="part.data" :caption="part.caption" />
  <pre v-else class="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{{ JSON.stringify(part.data, null, 2) }}</pre>
</template>
