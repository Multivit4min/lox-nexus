<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"
import type { PluginInstanceDto, PluginInstanceInput, PluginPackageDto } from "@lox-nexus/api"
import { Play, Plus, Square } from "@lucide/vue"
import { useRouter } from "vue-router"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AppContext } from "../AppContext.ts"
import { VisiblePolling } from "../lib/VisiblePolling.ts"
import InstanceForm from "../components/plugins/InstanceForm.vue"
import PluginIcon from "../components/plugins/PluginIcon.vue"
import PluginStateBadge from "../components/plugins/PluginStateBadge.vue"
import PluginTabs from "../components/plugins/PluginTabs.vue"
import { LiveValues } from "../stores/LiveValues.ts"

const context = AppContext.use()
const api = context.plugins
const router = useRouter()
const instances = ref<PluginInstanceDto[]>([])
const packages = ref<PluginPackageDto[]>([])
const adding = ref(false)
// states arrive live; messages, errors and restart counts with the list every few seconds
const live = new LiveValues(handlers => context.stream(handlers), "system/plugin/#")

const stateOf = (instance: PluginInstanceDto) => {
  const status = live.get(`system/plugin/${instance.slug}/status`)?.value
  return instance.state === "unavailable" || status?.type !== "string" ? instance.state : status.value
}
const nameOf = (id: string) => packages.value.find(p => p.id === id)?.name ?? id
const iconOf = (id: string) => packages.value.find(p => p.id === id)?.icon
const detail = (instance: PluginInstanceDto) => instance.statusMessage ?? instance.lastError ?? ""

async function load() {
  instances.value = await api.list()
}

async function create(input: PluginInstanceInput) {
  const created = await api.create(input)
  adding.value = false
  await router.push({ name: "plugin", params: { id: created.id } })
}

async function toggle(instance: PluginInstanceDto) {
  const running = !["stopped", "error", "unavailable"].includes(stateOf(instance))
  try {
    await (running ? api.stop(instance.id) : api.start(instance.id))
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error))
  }
  await load()
}

// a failed poll (server restarting) is retried by the next one
VisiblePolling.use(() => load().catch(() => undefined), 5000)
onMounted(async () => {
  ;[packages.value] = await Promise.all([api.packages(), load()])
})
onUnmounted(() => live.close())
</script>

<template>
  <div class="mx-auto max-w-[96rem] space-y-4 p-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-4">
        <h1 class="text-xl font-semibold">Plugins</h1>
        <PluginTabs />
      </div>
      <Button :disabled="!packages.length" :title="packages.length ? undefined : 'No plugin is installed; install one on the Installed tab'" @click="adding = true">
        <Plus class="size-4" /> Add instance
      </Button>
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead><TableHead>Plugin</TableHead><TableHead>Topic</TableHead><TableHead>Status</TableHead>
          <TableHead>Message</TableHead><TableHead class="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="instance in instances" :key="instance.id" class="cursor-pointer" @click="router.push({ name: 'plugin', params: { id: instance.id } })">
          <TableCell class="font-medium">
            <span class="flex items-center gap-2"><PluginIcon :name="iconOf(instance.plugin)" class="size-4 shrink-0 text-muted-foreground" />{{ instance.label }}</span>
          </TableCell>
          <TableCell>{{ nameOf(instance.plugin) }}</TableCell>
          <TableCell class="font-mono text-xs">{{ instance.plugin }}/{{ instance.slug }}</TableCell>
          <TableCell>
            <PluginStateBadge :state="stateOf(instance)" :title="detail(instance) || undefined" />
            <span v-if="instance.restarts" class="ml-2 text-xs text-muted-foreground" title="automatic restarts after crashes">↻ {{ instance.restarts }}</span>
          </TableCell>
          <TableCell class="max-w-64 truncate text-sm text-muted-foreground" :title="detail(instance)">{{ detail(instance) }}</TableCell>
          <TableCell @click.stop>
            <Button
              v-if="stateOf(instance) !== 'unavailable'" size="icon" variant="ghost" class="size-7"
              :title="['stopped', 'error'].includes(stateOf(instance)) ? 'Start' : 'Stop'" @click="toggle(instance)"
            >
              <Play v-if="['stopped', 'error'].includes(stateOf(instance))" class="size-4" />
              <Square v-else class="size-4" />
            </Button>
          </TableCell>
        </TableRow>
        <TableEmpty v-if="instances.length === 0" :colspan="6">
          No plugin instance yet. An instance is one configured connection, e.g. one inverter.
        </TableEmpty>
      </TableBody>
    </Table>
    <Dialog v-model:open="adding">
      <DialogContent class="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add plugin instance</DialogTitle>
          <DialogDescription>An instance is one configured connection, e.g. one Home Assistant server or one inverter. Add its sensors and actuators afterwards.</DialogDescription>
        </DialogHeader>
        <InstanceForm :packages="packages" :submit="create" />
      </DialogContent>
    </Dialog>
  </div>
</template>
