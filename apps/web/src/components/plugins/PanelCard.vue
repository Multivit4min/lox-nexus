<script setup lang="ts">
import type { Panel, RowAction } from "@lox-nexus/plugin-sdk/wire"
import { RefreshCw } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import PanelPartView from "./PanelPartView.vue"

/** The status view a plugin declares: key-value pairs, a table, JSON, a QR code, or titled sections of those. Plugins ship no UI code. */
defineProps<{ panel: Panel; loading?: boolean }>()
const emit = defineEmits<{ refresh: []; action: [action: RowAction] }>()
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between">
      <CardTitle>Status</CardTitle>
      <Button size="icon" variant="ghost" class="size-7" title="Refresh" :disabled="loading" @click="emit('refresh')"><RefreshCw class="size-4" /></Button>
    </CardHeader>
    <CardContent>
      <div v-if="panel.type === 'sections'" class="grid gap-5">
        <section v-for="(section, i) in panel.sections" :key="i" class="grid gap-2">
          <h3 class="text-sm font-medium">{{ section.title }}</h3>
          <PanelPartView :part="section.panel" @action="action => emit('action', action)" />
        </section>
      </div>
      <PanelPartView v-else :part="panel" @action="action => emit('action', action)" />
    </CardContent>
  </Card>
</template>
