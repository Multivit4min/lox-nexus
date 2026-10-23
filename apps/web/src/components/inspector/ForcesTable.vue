<script setup lang="ts">
import type { ForceDto } from "@lox-nexus/api"
import { Unlock } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import ValueText from "../ValueText.vue"

/** Every active force, with its reason and automatic release. */
defineProps<{ forces: ForceDto[] }>()
const emit = defineEmits<{ release: [topic: string] }>()
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Topic</TableHead><TableHead>Value</TableHead><TableHead>By</TableHead>
        <TableHead>Reason</TableHead><TableHead>Since</TableHead><TableHead>Until</TableHead><TableHead />
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="force in forces" :key="force.topic">
        <TableCell class="font-mono text-xs">{{ force.topic }}</TableCell>
        <TableCell><ValueText :value="force.value" /></TableCell>
        <TableCell>{{ force.by }}</TableCell>
        <TableCell>{{ force.reason }}</TableCell>
        <TableCell class="text-muted-foreground">{{ new Date(force.at).toLocaleString() }}</TableCell>
        <TableCell class="text-muted-foreground">{{ force.until ? new Date(force.until).toLocaleString() : "until released" }}</TableCell>
        <TableCell class="text-right">
          <Button size="sm" variant="outline" @click="emit('release', force.topic)"><Unlock class="size-4" /> Release</Button>
        </TableCell>
      </TableRow>
      <TableEmpty v-if="forces.length === 0" :colspan="7">Nothing is forced.</TableEmpty>
    </TableBody>
  </Table>
</template>
