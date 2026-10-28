<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { BridgeResultDto, MiniserverDto } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AppContext } from "../../AppContext.ts"
import { BridgeDraft, type BridgeCandidate, type BridgeRow } from "../../lib/BridgeDraft.ts"
import FormField from "../FormField.vue"
import BridgeResults from "./BridgeResults.vue"
import BridgeRows from "./BridgeRows.vue"

/**
 * Connects plugin signals to a Miniserver: each gets a Loxone signal and a wire. Packet ids are
 * suggested (free on the chosen Miniserver) and can be changed, since they have to match Loxone
 * Config. Can't be closed while the request runs. Emits `changed` once something was created.
 */
const props = defineProps<{ instanceId: string; candidates: BridgeCandidate[] }>()
const emit = defineEmits<{ changed: [] }>()
const open = defineModel<boolean>("open", { required: true })
const { plugins, miniservers: miniserverApi, wires: wireApi } = AppContext.use()

const miniservers = ref<MiniserverDto[]>([])
const miniserverId = ref("")
const rows = ref<BridgeRow[]>([])
const connected = ref(new Map<string, string[]>())
const results = ref<BridgeResultDto[]>()
const busy = ref(false)
/** suggestions for the chosen Miniserver are on their way: until then the packet ids aren't checked against it */
const suggesting = ref(false)
let suggestion = 0
const failure = ref<string>()
const description = computed(() => {
  const sensors = props.candidates.filter(c => c.kind === "sensor").length
  return [
    "Each signal gets a Loxone signal and a wire.",
    sensors ? "Sensors send their values to the Miniserver." : "",
    sensors < props.candidates.length ? "Actuators are controlled by it." : "",
    "Use the same packet ids in Loxone Config."
  ].filter(Boolean).join(" ")
})

const report = (error: unknown) => (failure.value = error instanceof Error ? error.message : String(error))
const keepOpen = (event: Event) => busy.value && event.preventDefault()

watch(open, async isOpen => {
  if (!isOpen) return
  results.value = undefined
  failure.value = undefined
  connected.value = new Map()
  rows.value = BridgeDraft.rows(props.candidates, [])
  try {
    miniservers.value = await miniserverApi.list()
    const previous = miniserverId.value
    miniserverId.value = miniservers.value.length === 1 ? miniservers.value[0]!.id : ""
    // the watcher only sees a change; the same Miniserver as last time may have new signals
    if (miniserverId.value === previous) await suggest(previous)
  } catch (error) {
    report(error)
  }
}, { immediate: true })

watch(miniserverId, id => suggest(id))

// Suggestions avoid the packet ids the chosen Miniserver has, and those it sends without a signal
// (discovered): an actuator on one of those would be switched by the Miniserver's next packet.
// Names and data types the user set stay. An answer for a Miniserver chosen before is dropped.
async function suggest(id: string) {
  const current = ++suggestion
  suggesting.value = !!id
  if (!id) return
  try {
    const [loxone, discovered, wires] = await Promise.all([miniserverApi.signals(id), miniserverApi.discovered(id), wireApi.list()])
    if (current !== suggestion) return
    connected.value = BridgeDraft.connected(props.candidates, wires, loxone)
    const fresh = BridgeDraft.rows(props.candidates, [...loxone, ...discovered].map(s => s.packetId))
    rows.value = rows.value.map((row, i) => ({ ...row, packetId: fresh[i]!.packetId }))
  } catch (error) {
    if (current === suggestion) report(error)
  } finally {
    if (current === suggestion) suggesting.value = false
  }
}

async function submit() {
  busy.value = true
  failure.value = undefined
  try {
    results.value = await plugins.bridge(props.instanceId, BridgeDraft.request(miniserverId.value, rows.value))
    if (results.value.some(r => r.ok)) emit("changed")
  } catch (error) {
    report(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-4xl" :show-close-button="!busy" @escape-key-down="keepOpen" @interact-outside="keepOpen">
      <DialogHeader>
        <DialogTitle>Connect to a Miniserver</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>
      <BridgeResults v-if="results" :results="results" :labels="rows.map(row => row.candidate.label)" @close="open = false" />
      <form v-else class="grid min-w-0 gap-4" @submit.prevent="submit">
        <p v-if="!miniservers.length && !failure" class="text-sm text-muted-foreground">
          No Miniserver yet. <a href="#/miniservers" class="underline">Add one</a> first.
        </p>
        <FormField v-else id="bridgeMiniserver" label="Miniserver">
          <Select v-model="miniserverId">
            <SelectTrigger id="bridgeMiniserver" class="w-full sm:w-72"><SelectValue placeholder="Choose a Miniserver" /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="m in miniservers" :key="m.id" :value="m.id">{{ m.label || m.slug }}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <BridgeRows v-model="rows" :connected="connected" :disabled="busy || suggesting" />
        <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" :disabled="busy" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="busy || suggesting || !miniserverId || !rows.length">{{ busy ? "Connecting…" : `Connect ${rows.length}` }}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
