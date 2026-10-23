<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"
import type { DiscoveredPacketDto, LoxoneSignalDto, LoxoneSignalInput, MiniserverDto, MiniserverInput, MiniserverLoadDto } from "@lox-nexus/api"
import { useIntervalFn } from "@vueuse/core"
import { Pencil, Play, Square, Trash2 } from "@lucide/vue"
import { useRouter } from "vue-router"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppContext } from "../AppContext.ts"
import DiscoveredCard from "../components/DiscoveredCard.vue"
import HealthBadge from "../components/HealthBadge.vue"
import LoadCard from "../components/load/LoadCard.vue"
import MiniserverForm from "../components/MiniserverForm.vue"
import SignalsCard from "../components/SignalsCard.vue"
import { LiveValues } from "../stores/LiveValues.ts"

const props = defineProps<{ id: string }>()
const context = AppContext.use()
const api = context.miniservers
const router = useRouter()
const ms = ref<MiniserverDto>()
const signals = ref<LoxoneSignalDto[]>([])
const discovered = ref<DiscoveredPacketDto[]>([])
const traffic = ref<MiniserverLoadDto>()
const editing = ref(false)
let live: LiveValues | undefined

async function refresh() {
  ;[ms.value, discovered.value, traffic.value] = await Promise.all([api.get(props.id), api.discovered(props.id), api.load(props.id)])
}

async function load() {
  await refresh()
  signals.value = await api.signals(props.id)
  live ??= new LiveValues(handlers => context.stream(handlers), `loxone/${ms.value!.slug}/#`)
  live.watch(`loxone/${ms.value!.slug}/#`)
}

// health, errors, discovery and load change on their own (load is sampled every 5 s); the stream covers signal values
useIntervalFn(refresh, 5000)
onMounted(load)
onUnmounted(() => live?.close())

async function save(input: MiniserverInput) {
  ms.value = await api.update(props.id, input)
  editing.value = false
  await load()
}

async function run(action: "start" | "stop") {
  ms.value = await (action === "start" ? api.start(props.id) : api.stop(props.id))
}

async function remove() {
  if (!confirm(`Delete "${ms.value?.label}" with all its signals and their wires?`)) return
  await api.remove(props.id)
  await router.push({ name: "miniservers" })
}

async function addSignal(input: LoxoneSignalInput) {
  await api.addSignal(props.id, input)
  signals.value = await api.signals(props.id)
}

async function removeSignal(signal: LoxoneSignalDto) {
  await api.removeSignal(props.id, signal.id)
  signals.value = await api.signals(props.id)
}

async function adopt(packet: DiscoveredPacketDto) {
  await api.adopt(props.id, { packetId: packet.packetId })
  await load()
}
</script>

<template>
  <div v-if="ms" class="mx-auto max-w-5xl space-y-4 p-6">
    <div class="flex items-center gap-3">
      <h1 class="text-xl font-semibold">{{ ms.label }}</h1>
      <HealthBadge :health="ms.health" />
      <span class="font-mono text-xs text-muted-foreground">loxone/{{ ms.slug }} · {{ ms.host }}:{{ ms.port }} · listens on {{ ms.boundPort ?? ms.listenPort }}</span>
      <div class="ml-auto flex gap-2">
        <Button v-if="ms.running" variant="outline" size="sm" @click="run('stop')"><Square class="size-4" /> Stop</Button>
        <Button v-else variant="outline" size="sm" @click="run('start')"><Play class="size-4" /> Start</Button>
        <Button variant="outline" size="sm" @click="editing = true"><Pencil class="size-4" /> Edit</Button>
        <Button variant="destructive" size="sm" @click="remove"><Trash2 class="size-4" /> Delete</Button>
      </div>
    </div>
    <Alert v-if="ms.lastError" variant="destructive">
      <AlertTitle>Start failed</AlertTitle>
      <AlertDescription>{{ ms.lastError }}</AlertDescription>
    </Alert>
    <LoadCard v-if="traffic" :load="traffic" />
    <SignalsCard v-if="live" :signals="signals" :live="live" :add="addSignal" :remove="removeSignal" />
    <DiscoveredCard :packets="discovered" :adopt="adopt" />
    <Dialog v-model:open="editing">
      <DialogContent class="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit {{ ms.label }}</DialogTitle></DialogHeader>
        <MiniserverForm :initial="ms" :submit="save" />
      </DialogContent>
    </Dialog>
  </div>
</template>
