<script setup lang="ts">
import { defineAsyncComponent } from "vue"
import type { PanelPart, RowAction } from "@lox-nexus/plugin-sdk/wire"
import ActionControl from "./panel/ActionControl.vue"
import CellView from "./panel/CellView.vue"
import NoticeView from "./panel/NoticeView.vue"
import PanelTable from "./panel/PanelTable.vue"
import TilesView from "./panel/TilesView.vue"

// the encoder comes with it, so only panels that show a code load it
const QrCode = defineAsyncComponent(() => import("./QrCode.vue"))

/**
 * One part of a plugin's panel: key-value pairs (each may have a button or switch), a table
 * (search, sort, pages, buttons per row), tiles, a notice, a QR code or JSON.
 */
const props = defineProps<{ part: PanelPart; labelOf?: (action: RowAction) => string; busy?: boolean }>()
const emit = defineEmits<{ action: [action: RowAction] }>()
const label = (action: RowAction) => props.labelOf?.(action) ?? action.label ?? action.action
</script>

<template>
  <dl v-if="part.type === 'keyValue'" class="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-6 gap-y-1.5 text-sm">
    <template v-for="item in part.items" :key="item.label">
      <dt class="text-muted-foreground">{{ item.label }}</dt>
      <dd class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CellView :cell="item.value" />
        <ActionControl v-if="item.control" :action="item.control" :label="label(item.control)" :disabled="busy" @run="emit('action', item.control)" />
      </dd>
    </template>
  </dl>
  <p v-else-if="part.type === 'table' && part.rows.length === 0" class="text-sm text-muted-foreground">Nothing to show yet.</p>
  <PanelTable v-else-if="part.type === 'table'" :columns="part.columns" :rows="part.rows" :row-actions="part.rowActions" :label-of="label" :busy="busy" @action="action => emit('action', action)" />
  <TilesView v-else-if="part.type === 'tiles'" :tiles="part.tiles" />
  <NoticeView v-else-if="part.type === 'notice'" :notice="part" />
  <QrCode v-else-if="part.type === 'qr'" :data="part.data" :caption="part.caption" />
  <pre v-else class="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{{ JSON.stringify(part.data, null, 2) }}</pre>
</template>
