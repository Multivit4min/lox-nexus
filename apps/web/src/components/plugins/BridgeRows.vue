<script setup lang="ts">
import { ArrowLeft, ArrowRight } from "@lucide/vue"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { BridgeRow } from "../../lib/BridgeDraft.ts"
import { DataTypes } from "../../lib/DataTypes.ts"
import { PacketIds } from "../../lib/PacketIds.ts"

/**
 * The signals to connect, each with the name, data type and packet id its Loxone signal gets.
 * `connected` names the packet ids a signal is wired to already, so it isn't connected twice by mistake.
 */
defineProps<{ connected: Map<string, string[]>; disabled?: boolean }>()
const rows = defineModel<BridgeRow[]>({ required: true })
const setType = (row: BridgeRow, value: unknown) => (row.dataType = DataTypes.idOf(Number(value)))
</script>

<template>
  <div class="max-h-[50vh] overflow-y-auto rounded-md border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Signal</TableHead>
          <TableHead class="w-10"><span class="sr-only">Direction</span></TableHead>
          <TableHead>Loxone name</TableHead>
          <TableHead>Data type</TableHead>
          <TableHead>Packet id</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="row in rows" :key="row.candidate.key">
          <TableCell class="max-w-48">
            <span class="block truncate font-medium" :title="row.candidate.label">{{ row.candidate.label }}</span>
            <span v-if="connected.has(row.candidate.key)" class="block truncate text-xs text-amber-700 dark:text-amber-400">
              already wired to {{ connected.get(row.candidate.key)!.join(", ") }}
            </span>
          </TableCell>
          <TableCell>
            <ArrowRight v-if="row.candidate.kind === 'sensor'" class="size-4 text-muted-foreground" aria-label="sends to the Miniserver" />
            <ArrowLeft v-else class="size-4 text-muted-foreground" aria-label="controlled by the Miniserver" />
          </TableCell>
          <TableCell>
            <Input v-model="row.label" class="h-8 min-w-36" maxlength="100" :disabled="disabled" :aria-label="`Loxone name for ${row.candidate.label}`" />
          </TableCell>
          <TableCell>
            <Select :model-value="String(row.dataType)" :disabled="disabled" @update:model-value="v => setType(row, v)">
              <SelectTrigger class="h-8 w-44" :aria-label="`Data type for ${row.candidate.label}`"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="type in DataTypes.ALL" :key="type.id" :value="String(type.id)">{{ type.name }}</SelectItem>
              </SelectContent>
            </Select>
          </TableCell>
          <TableCell>
            <Input
              v-model="row.packetId" class="h-8 w-28 font-mono" required :maxlength="PacketIds.MAX" :disabled="disabled"
              :aria-label="`Packet id for ${row.candidate.label}`"
            />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
