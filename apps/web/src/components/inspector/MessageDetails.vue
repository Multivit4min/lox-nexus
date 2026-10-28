<script setup lang="ts">
import { ref, watch } from "vue"
import type { BusMessageDto, TraceNodeDto } from "@lox-nexus/api"
import { Lock, Send, Unlock } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AppContext } from "../../AppContext.ts"
import { MessageText } from "../../lib/MessageText.ts"
import ValueText from "../ValueText.vue"
import TraceTree from "./TraceTree.vue"

/** Side panel for one message: its fields, the cause chain it belongs to, and actions on its topic. */
const props = defineProps<{ message?: BusMessageDto; forced: boolean }>()
const open = defineModel<boolean>("open", { required: true })
const emit = defineEmits<{ select: [message: BusMessageDto]; force: []; release: []; inject: [] }>()
const { bus } = AppContext.use()
const trace = ref<TraceNodeDto[]>([])

// the trace is fetched for the clicked message; older ancestors may already be evicted, then several roots come back
watch(() => props.message?.traceId, async () => {
  trace.value = props.message ? await bus.trace(props.message.id).catch(() => []) : []
}, { immediate: true })

const rows = (message: BusMessageDto): Array<[string, string]> => [
  ["kind", message.kind],
  ["time", `${new Date(message.ts).toLocaleDateString()} ${MessageText.time(message.ts)}`],
  ["source", MessageText.source(message)],
  ["flags", MessageText.flags(message).join(", ") || "none"],
  ["detail", MessageText.detail(message)],
  ["id", message.id],
  ["caused by", message.causedBy ?? "nothing (start of a chain)"]
]
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent class="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
      <template v-if="message">
        <SheetHeader>
          <SheetTitle class="break-all font-mono text-sm">{{ message.topic }}</SheetTitle>
          <SheetDescription><ValueText v-if="message.value" :value="message.value" /></SheetDescription>
        </SheetHeader>
        <div class="space-y-4 px-4 pb-4">
          <div class="flex gap-2">
            <Button v-if="forced" size="sm" variant="outline" @click="emit('release')"><Unlock class="size-4" /> Release</Button>
            <Button v-else size="sm" variant="outline" @click="emit('force')"><Lock class="size-4" /> Force</Button>
            <Button size="sm" variant="outline" @click="emit('inject')"><Send class="size-4" /> Inject</Button>
          </div>
          <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
            <template v-for="[label, text] in rows(message)" :key="label">
              <dt class="text-muted-foreground">{{ label }}</dt>
              <dd class="break-all font-mono text-xs leading-5">{{ text }}</dd>
            </template>
          </dl>
          <Separator />
          <h3 class="text-sm font-medium">Cause chain</h3>
          <TraceTree :nodes="trace" :selected="message.id" @select="m => emit('select', m)" />
        </div>
      </template>
    </SheetContent>
  </Sheet>
</template>
