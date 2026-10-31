<script setup lang="ts">
import type { ActionDescription, Panel, RowAction } from "@lox-nexus/plugin-sdk/wire"
import { RefreshCw } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import ActionControl from "./panel/ActionControl.vue"
import PanelPartView from "./PanelPartView.vue"

/**
 * The status view a plugin declares: key-value pairs, a table, tiles, a notice, JSON, a QR code, or
 * titled sections of those, a section with buttons or switches for actions in its heading. Plugins
 * ship no UI code.
 */
// busy: an instant action or switch is running; its buttons wait for it
const props = defineProps<{ panel: Panel; loading?: boolean; busy?: boolean; actions?: ActionDescription[] }>()
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
              <ActionControl v-for="button in section.actions" :key="button.action + labelOf(button)" :action="button" :label="labelOf(button)" :disabled="busy" @run="emit('action', button)" />
            </div>
          </div>
          <PanelPartView :part="section.panel" :label-of="labelOf" :busy="busy" @action="action => emit('action', action)" />
        </section>
      </div>
      <PanelPartView v-else :part="panel" :label-of="labelOf" :busy="busy" @action="action => emit('action', action)" />
    </CardContent>
  </Card>
</template>
