<script setup lang="ts">
import { ref } from "vue"
import type { LoxoneSignalDto, LoxoneSignalInput } from "@lox-nexus/api"
import { Plus, Trash2 } from "@lucide/vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataTypes } from "../lib/DataTypes.ts"
import type { LiveValues } from "../stores/LiveValues.ts"
import SignalForm from "./SignalForm.vue"
import ValueText from "./ValueText.vue"

/** The configured signals of a Miniserver with their live values. */
const props = defineProps<{
  signals: LoxoneSignalDto[]
  live: LiveValues
  add: (input: LoxoneSignalInput) => Promise<void>
  remove: (signal: LoxoneSignalDto) => Promise<void>
}>()
const adding = ref(false)

async function onAdd(input: LoxoneSignalInput) {
  await props.add(input)
  adding.value = false
}

async function onRemove(signal: LoxoneSignalDto) {
  if (confirm(`Delete "${signal.label}"? Wires using it are deleted too.`)) await props.remove(signal)
}
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between">
      <CardTitle>Signals</CardTitle>
      <Button size="sm" variant="outline" @click="adding = true"><Plus class="size-4" /> Add signal</Button>
    </CardHeader>
    <CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead><TableHead>Packet</TableHead><TableHead>Type</TableHead>
            <TableHead>Topic</TableHead><TableHead>Value</TableHead><TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="signal in signals" :key="signal.id">
            <TableCell class="font-medium">{{ signal.label }}</TableCell>
            <TableCell><Badge variant="outline">{{ signal.direction }}</Badge> {{ signal.packetId }}</TableCell>
            <TableCell>{{ DataTypes.nameOf(signal.dataType) }}</TableCell>
            <TableCell class="font-mono text-xs">{{ signal.topic }}</TableCell>
            <TableCell><ValueText :value="live.get(signal.topic)?.value" /></TableCell>
            <TableCell class="text-right">
              <Button size="icon" variant="ghost" title="Delete" @click="onRemove(signal)"><Trash2 class="size-4" /></Button>
            </TableCell>
          </TableRow>
          <TableEmpty v-if="signals.length === 0" :colspan="6">No signals. Add one, or adopt a discovered packet below.</TableEmpty>
        </TableBody>
      </Table>
    </CardContent>
    <Dialog v-model:open="adding">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader><DialogTitle>Add signal</DialogTitle></DialogHeader>
        <SignalForm :submit="onAdd" />
      </DialogContent>
    </Dialog>
  </Card>
</template>
