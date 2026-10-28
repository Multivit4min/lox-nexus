<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue"
import type { PluginInstanceDto, PluginInstanceInput, PluginLogLineDto, PluginPackageDto, PluginSignalDto } from "@lox-nexus/api"
import type { Panel } from "@lox-nexus/plugin-sdk/wire"
import { useIntervalFn } from "@vueuse/core"
import { Pencil, Play, RotateCw, Square, Trash2 } from "@lucide/vue"
import { useRouter } from "vue-router"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppContext } from "../AppContext.ts"
import { ApiError } from "../api/ApiError.ts"
import InstanceForm from "../components/plugins/InstanceForm.vue"
import PanelCard from "../components/plugins/PanelCard.vue"
import PluginLogsCard from "../components/plugins/PluginLogsCard.vue"
import PluginSignalsCard from "../components/plugins/PluginSignalsCard.vue"
import PluginStateBadge from "../components/plugins/PluginStateBadge.vue"
import WiresCard from "../components/wires/WiresCard.vue"
import { LiveValues } from "../stores/LiveValues.ts"

const props = defineProps<{ id: string }>()
const context = AppContext.use()
const api = context.plugins
const router = useRouter()
const instance = ref<PluginInstanceDto>()
const packages = ref<PluginPackageDto[]>([])
const signals = ref<PluginSignalDto[]>([])
const logs = ref<PluginLogLineDto[]>([])
const panel = ref<Panel | null>(null)
const panelLoading = ref(false)
const editing = ref(false)
const busy = ref(false)
const live = shallowRef<LiveValues>()
const failure = ref<string>()
const missing = ref(false)
const wiresCard = ref<InstanceType<typeof WiresCard>>()
let unmounted = false
// a sensor is a wire's source, an actuator its target
const wire = (signal: PluginSignalDto) => wiresCard.value?.startNew(signal.kind === "sensor" ? { sourceId: signal.id } : { targetId: signal.id })

const pkg = computed(() => packages.value.find(p => p.id === instance.value?.plugin))
const running = computed(() => ["running", "degraded"].includes(instance.value?.state ?? ""))
const stopped = computed(() => ["stopped", "error"].includes(instance.value?.state ?? ""))
const topics = () => `${instance.value!.plugin}/${instance.value!.slug}/#`

// runs a step and shows what went wrong instead of failing silently; a 404 means the instance is gone
async function attempt(work: () => Promise<unknown>) {
  try {
    await work()
    failure.value = undefined
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) missing.value = true
    else failure.value = error instanceof Error ? error.message : String(error)
  }
}

// state, message, log lines and signal errors change on their own; signal values come over the stream.
// The panel follows the state: there while running, gone otherwise; a failing answer keeps the last one.
async function refresh() {
  ;[instance.value, logs.value, signals.value] = await Promise.all([api.get(props.id), api.logs(props.id), api.signals(props.id)])
  panel.value = running.value ? await api.panel(props.id).catch(() => panel.value) : null
}

async function refreshPanel() {
  panelLoading.value = true
  await attempt(refresh)
  panelLoading.value = false
}

async function loadSignals() {
  await attempt(async () => (signals.value = await api.signals(props.id)))
}

async function load() {
  await refresh()
  packages.value = await api.packages()
  // the view may be gone by now, and a stream opened after unmounting would never be closed
  if (unmounted) return
  if (!live.value) live.value = new LiveValues(handlers => context.stream(handlers), topics())
  else live.value.watch(topics())
}

async function lifecycle(...steps: Array<"start" | "stop">) {
  busy.value = true
  await attempt(async () => {
    for (const step of steps) instance.value = await (step === "start" ? api.start(props.id) : api.stop(props.id))
    await refresh()
  })
  busy.value = false
}

async function save(input: PluginInstanceInput) {
  instance.value = await api.update(props.id, input)
  editing.value = false
  await attempt(load)
}

async function remove() {
  if (!confirm(`Delete "${instance.value?.label}" with all its signals and their wires?`)) return
  await attempt(async () => {
    await api.remove(props.id)
    await router.push({ name: "plugins" })
  })
}

useIntervalFn(() => !missing.value && attempt(refresh), 3000)
onMounted(() => attempt(load))
onUnmounted(() => {
  unmounted = true
  live.value?.close()
})
</script>

<template>
  <div v-if="missing" class="mx-auto max-w-[96rem] space-y-2 p-6">
    <h1 class="text-xl font-semibold">Plugin instance not found</h1>
    <p class="text-sm text-muted-foreground">It may have been deleted. <RouterLink to="/plugins" class="underline">Back to the plugins</RouterLink></p>
  </div>
  <div v-else-if="failure && !instance" class="mx-auto max-w-[96rem] p-6">
    <Alert variant="destructive"><AlertTitle>Can't load the instance</AlertTitle><AlertDescription>{{ failure }}</AlertDescription></Alert>
  </div>
  <div v-else-if="instance" class="mx-auto max-w-[96rem] space-y-4 p-6">
    <div>
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-xl font-semibold">{{ instance.label }}</h1>
        <PluginStateBadge :state="instance.state" />
        <span v-if="instance.restarts" class="text-sm text-muted-foreground" title="automatic restarts after crashes">restarted {{ instance.restarts }}×</span>
        <div class="ml-auto flex gap-2">
          <Button v-if="stopped" variant="outline" size="sm" :disabled="busy" @click="lifecycle('start')"><Play class="size-4" /> Start</Button>
          <template v-else-if="instance.state !== 'unavailable'">
            <Button variant="outline" size="sm" :disabled="busy" @click="lifecycle('stop', 'start')"><RotateCw class="size-4" /> Restart</Button>
            <Button variant="outline" size="sm" :disabled="busy" @click="lifecycle('stop')"><Square class="size-4" /> Stop</Button>
          </template>
          <Button variant="outline" size="sm" :disabled="!pkg" @click="editing = true"><Pencil class="size-4" /> Edit</Button>
          <Button variant="destructive" size="sm" @click="remove"><Trash2 class="size-4" /> Delete</Button>
        </div>
      </div>
      <p class="mt-1 font-mono text-xs text-muted-foreground">{{ instance.plugin }}/{{ instance.slug }} · {{ pkg ? `${pkg.name} ${pkg.version}` : "plugin not installed" }}</p>
    </div>
    <Alert v-if="failure" variant="destructive">
      <AlertDescription>{{ failure }}</AlertDescription>
    </Alert>
    <Alert v-if="instance.state === 'unavailable'" variant="destructive">
      <AlertTitle>Plugin not available</AlertTitle>
      <AlertDescription>The plugin "{{ instance.plugin }}" is not installed (any more). The instance and its signals are kept until it is back.</AlertDescription>
    </Alert>
    <Alert v-else-if="instance.lastError && (instance.state === 'error' || instance.state === 'crashed')" variant="destructive">
      <AlertTitle>{{ instance.state === "crashed" ? "Crashed, restarting" : "Failed to start" }}</AlertTitle>
      <AlertDescription>{{ instance.lastError }}</AlertDescription>
    </Alert>
    <Alert v-else-if="instance.statusMessage">
      <AlertTitle>Degraded</AlertTitle>
      <AlertDescription>{{ instance.statusMessage }}</AlertDescription>
    </Alert>
    <PanelCard v-if="panel" :panel="panel" :loading="panelLoading" @refresh="refreshPanel" />
    <PluginSignalsCard v-if="pkg && live" :instance="instance" :description="pkg.description" :signals="signals" :live="live" @changed="loadSignals" @wire="wire" />
    <WiresCard ref="wiresCard" :owner-id="instance.id" />
    <PluginLogsCard :lines="logs" />
    <Dialog v-model:open="editing">
      <DialogContent class="sm:max-w-4xl">
        <DialogHeader><DialogTitle>Edit {{ instance.label }}</DialogTitle></DialogHeader>
        <InstanceForm v-if="editing" :packages="packages" :initial="instance" :submit="save" />
      </DialogContent>
    </Dialog>
  </div>
</template>
