<script setup lang="ts">
import type { ActionDescription, Panel, RowAction } from "@lox-nexus/plugin-sdk/wire"
import { RefreshCw, Zap } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import PanelPartView from "./PanelPartView.vue"

/**
 * The status view a plugin declares: key-value pairs, a table, JSON, a QR code, or titled sections
 * of those, a section with buttons for actions in its heading. Plugins ship no UI code.
 */
const props = defineProps<{ panel: Panel; loading?: boolean; actions?: ActionDescription[] }>()
const emit = defineEmits<{ refresh: []; action: [action: RowAction] }>()
const labelOf = (button: RowAction) => button.label ?? props.actions?.find(action => action.id === button.action)?.label ?? button.action
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
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-medium">{{ section.title }}</h3>
            <div v-if="section.actions?.length" class="flex flex-wrap gap-2">
              <Button v-for="button in section.actions" :key="button.action + labelOf(button)" size="sm" variant="outline" @click="emit('action', button)">
                <Zap class="size-4" /> {{ labelOf(button) }}
              </Button>
            </div>
          </div>
          <PanelPartView :part="section.panel" @action="action => emit('action', action)" />
        </section>
      </div>
      <PanelPartView v-else :part="panel" @action="action => emit('action', action)" />
    </CardContent>
  </Card>
</template>
