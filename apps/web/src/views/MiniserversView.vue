<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"
import type { MiniserverDto, MiniserverInput } from "@lox-nexus/api"
import { Plus } from "@lucide/vue"
import { useRouter } from "vue-router"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AppContext } from "../AppContext.ts"
import HealthBadge from "../components/HealthBadge.vue"
import MiniserverForm from "../components/MiniserverForm.vue"
import { LiveValues } from "../stores/LiveValues.ts"

const context = AppContext.use()
const api = context.miniservers
const router = useRouter()
const list = ref<MiniserverDto[]>([])
const adding = ref(false)
// health changes arrive live; the list itself only changes through this UI
const live = new LiveValues(handlers => context.stream(handlers), "system/loxone/+/status")

const health = (ms: MiniserverDto) => {
  const status = live.get(`system/loxone/${ms.slug}/status`)?.value
  return status?.type === "string" ? status.value : ms.health
}

async function load() {
  list.value = await api.list()
}

async function create(input: MiniserverInput) {
  const created = await api.create(input)
  adding.value = false
  await router.push({ name: "miniserver", params: { id: created.id } })
}

onMounted(load)
onUnmounted(() => live.close())
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-4 p-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Miniservers</h1>
      <Button @click="adding = true"><Plus class="size-4" /> Add Miniserver</Button>
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead><TableHead>Topic</TableHead><TableHead>Address</TableHead>
          <TableHead>Listen port</TableHead><TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow
          v-for="ms in list" :key="ms.id" class="cursor-pointer"
          @click="router.push({ name: 'miniserver', params: { id: ms.id } })"
        >
          <TableCell class="font-medium">{{ ms.label }}</TableCell>
          <TableCell class="font-mono text-xs">loxone/{{ ms.slug }}</TableCell>
          <TableCell>{{ ms.host }}:{{ ms.port }}</TableCell>
          <TableCell>{{ ms.listenPort }}</TableCell>
          <TableCell><HealthBadge :health="health(ms)" /></TableCell>
        </TableRow>
        <TableEmpty v-if="list.length === 0" :colspan="5">No Miniserver yet.</TableEmpty>
      </TableBody>
    </Table>
    <Dialog v-model:open="adding">
      <DialogContent class="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Add Miniserver</DialogTitle></DialogHeader>
        <MiniserverForm :submit="create" />
      </DialogContent>
    </Dialog>
  </div>
</template>
