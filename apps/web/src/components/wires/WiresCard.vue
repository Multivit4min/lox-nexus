<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import type { SupportedTransformDto, WireDto, WireInputDto } from "@lox-nexus/api"
import { Plus } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppContext } from "../../AppContext.ts"
import { ApiError } from "../../api/ApiError.ts"
import { TextFilter } from "../../lib/TextFilter.ts"
import { VisiblePolling } from "../../lib/VisiblePolling.ts"
import { LiveValues } from "../../stores/LiveValues.ts"
import { WireBoard, type WireRow } from "../../stores/WireBoard.ts"
import ListToolbar from "../data/ListToolbar.vue"
import WireForm from "./WireForm.vue"
import WiresTable from "./WiresTable.vue"

/**
 * Wires with their status, searchable, with create, edit, switch on/off and delete. With `ownerId`
 * only the wires of that Miniserver's or plugin instance's signals. Values are live from the stream;
 * owner states (a Miniserver going offline, a plugin stopping) are picked up by a slow reload.
 */
const props = defineProps<{ ownerId?: string; title?: string }>()
const context = AppContext.use()
const { wired } = context
const board = new WireBoard(context)
// a wire's ends may belong to any Miniserver or plugin, so every topic
const live = new LiveValues(handlers => context.stream(handlers), "#")
onUnmounted(() => live.close())
const query = ref("")
const failure = ref<string>()
const busy = ref(false)
const creating = ref<{ sourceId?: string; targetId?: string }>()
const editing = ref<WireDto>()

const rows = computed(() => board.rows(props.ownerId, live))
const visible = computed(() => {
  const filter = new TextFilter(query.value)
  return rows.value.filter(row => filter.matches(row.wire.label, row.source?.label, row.source?.topic, row.target?.label, row.target?.topic, row.status.text))
})
const ownerName = board.ownerName.bind(board)

async function attempt(work: () => Promise<unknown>) {
  try {
    await work()
    failure.value = undefined
  } catch (error) {
    failure.value = error instanceof ApiError || error instanceof Error ? error.message : String(error)
  }
}

// the marks in the signal lists follow every change made here
const load = () => attempt(() => Promise.all([board.load(), wired.load()]))

async function create(input: WireInputDto) {
  await context.wires.create(input)
  creating.value = undefined
  await load()
}

async function update(input: WireInputDto) {
  await context.wires.update(editing.value!.id, input)
  editing.value = undefined
  await load()
}

async function toggle(row: WireRow, enabled: boolean) {
  const { id, label, sourceId, targetId, syncOnStart } = row.wire
  const transforms = row.wire.transforms.filter((step): step is SupportedTransformDto => step.op !== "unsupported")
  if (transforms.length < row.wire.transforms.length) return void (failure.value = `"${label}" has steps this version can't run; open it to fix them first.`)
  busy.value = true
  await attempt(async () => {
    await context.wires.update(id, { label, sourceId, targetId, transforms, syncOnStart, enabled })
    await load()
  })
  busy.value = false
}

async function remove(row: WireRow) {
  if (!confirm(`Delete the wire "${row.wire.label}"?`)) return
  await attempt(async () => {
    await context.wires.remove(row.wire.id)
    await load()
  })
}

/** opens the form for a new wire, optionally starting at a signal (reloaded first: it may be brand new) */
async function startNew(preset: { sourceId?: string; targetId?: string } = {}) {
  await load()
  creating.value = preset
}
defineExpose({ startNew })

// not while a form is open: its pickers would change under the user
VisiblePolling.use(() => attempt(() => board.poll()), 15_000, () => !creating.value && !editing.value)
onMounted(load)
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between gap-2">
      <CardTitle>{{ title ?? "Wires" }}</CardTitle>
      <Button size="sm" variant="outline" :disabled="!board.state.loaded" @click="startNew()"><Plus class="size-4" /> New wire</Button>
    </CardHeader>
    <CardContent class="space-y-3">
      <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
      <ListToolbar v-model="query" :shown="visible.length" :total="rows.length" placeholder="Search wire, signal or status" />
      <WiresTable
        :rows="visible" :owner-name="ownerName" :busy="busy"
        :empty="!board.state.loaded ? 'Loading…' : rows.length ? 'No wire matches.' : 'No wires yet. A wire carries the values of a source to a target.'"
        @edit="row => (editing = row.wire)" @remove="remove" @toggle="toggle"
      />
    </CardContent>
    <Dialog :open="!!creating" @update:open="open => !open && (creating = undefined)">
      <DialogContent class="sm:max-w-3xl">
        <DialogHeader><DialogTitle>New wire</DialogTitle></DialogHeader>
        <WireForm v-if="creating" :board="board" :preset="creating" :submit="create" />
      </DialogContent>
    </Dialog>
    <Dialog :open="!!editing" @update:open="open => !open && (editing = undefined)">
      <DialogContent class="sm:max-w-3xl">
        <DialogHeader><DialogTitle>Edit {{ editing?.label }}</DialogTitle></DialogHeader>
        <WireForm v-if="editing" :key="editing.id" :board="board" :initial="editing" :submit="update" />
      </DialogContent>
    </Dialog>
  </Card>
</template>
