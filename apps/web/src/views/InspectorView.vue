<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import type { BusMessageDto } from "@lox-nexus/api"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AppContext } from "../AppContext.ts"
import ForceDialog from "../components/inspector/ForceDialog.vue"
import ForcesTable from "../components/inspector/ForcesTable.vue"
import InjectDialog from "../components/inspector/InjectDialog.vue"
import InspectorToolbar from "../components/inspector/InspectorToolbar.vue"
import MessageDetails from "../components/inspector/MessageDetails.vue"
import MessageList from "../components/inspector/MessageList.vue"
import { InspectorStore } from "../stores/InspectorStore.ts"

const context = AppContext.use()
const store = new InspectorStore(context.bus, handlers => context.stream(handlers))
const selected = ref<BusMessageDto>()
const detailsOpen = ref(false)
const forcing = ref(false)
const injecting = ref(false)

const visible = computed(() => store.visible())
const selectedForced = computed(() => store.forces.value.some(force => force.topic === selected.value?.topic))

function select(message: BusMessageDto) {
  selected.value = message
  detailsOpen.value = true
}

async function release(topic: string) {
  await context.bus.release(topic)
  await store.loadForces()
}

onMounted(() => store.open())
onUnmounted(() => store.close())
</script>

<template>
  <div class="flex h-full flex-col">
    <InspectorToolbar :store="store" @inject="selected = undefined; injecting = true" />
    <Tabs default-value="messages" class="flex min-h-0 flex-1 flex-col gap-0">
      <TabsList class="m-2">
        <TabsTrigger value="messages">Messages ({{ visible.length }})</TabsTrigger>
        <TabsTrigger value="forces">Forced ({{ store.forces.value.length }})</TabsTrigger>
      </TabsList>
      <TabsContent value="messages" class="min-h-0 flex-1">
        <MessageList :messages="visible" :selected="selected?.id" @select="select" />
      </TabsContent>
      <TabsContent value="forces" class="p-2">
        <ForcesTable :forces="store.forces.value" @release="release" />
      </TabsContent>
    </Tabs>
    <MessageDetails
      v-model:open="detailsOpen" :message="selected" :forced="selectedForced"
      @select="select" @force="forcing = true" @release="selected && release(selected.topic)" @inject="injecting = true"
    />
    <ForceDialog v-if="selected" v-model:open="forcing" :topic="selected.topic" :current="selected.value" @done="store.loadForces()" />
    <InjectDialog v-model:open="injecting" :topic="selected?.topic" :current="selected?.value" />
  </div>
</template>
