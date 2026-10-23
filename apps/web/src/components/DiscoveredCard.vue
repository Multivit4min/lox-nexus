<script setup lang="ts">
import type { DiscoveredPacketDto } from "@lox-nexus/api"
import { Download } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataTypes } from "../lib/DataTypes.ts"
import ValueText from "./ValueText.vue"

/** Packet ids the Miniserver sends that no signal is configured for yet. */
defineProps<{ packets: DiscoveredPacketDto[]; adopt: (packet: DiscoveredPacketDto) => Promise<void> }>()

const ago = (ts: number) => {
  const seconds = Math.round((Date.now() - ts) / 1000)
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}min ago`
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Discovered</CardTitle>
      <CardDescription>Adopting a packet turns it into an input signal of the type it arrives with.</CardDescription>
    </CardHeader>
    <CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Packet</TableHead><TableHead>Type</TableHead><TableHead>Last value</TableHead>
            <TableHead>Last seen</TableHead><TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="packet in packets" :key="packet.packetId">
            <TableCell class="font-mono">{{ packet.packetId }}</TableCell>
            <TableCell>{{ DataTypes.nameOf(packet.dataType) }}</TableCell>
            <TableCell><ValueText :value="packet.value" /></TableCell>
            <TableCell class="text-muted-foreground">{{ ago(packet.lastSeen) }}</TableCell>
            <TableCell class="text-right">
              <Button size="sm" variant="outline" :disabled="packet.dataType > 6" @click="adopt(packet)"><Download class="size-4" /> Adopt</Button>
            </TableCell>
          </TableRow>
          <TableEmpty v-if="packets.length === 0" :colspan="5">Nothing unknown received yet.</TableEmpty>
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</template>
