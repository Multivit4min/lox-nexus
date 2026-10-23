<script setup lang="ts">
import { ref, watch } from "vue"
import type { MiniserverLoadDto } from "@lox-nexus/api"
import { useIntervalFn } from "@vueuse/core"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AppContext } from "../../AppContext.ts"
import { LoadLevel } from "../../lib/LoadLevel.ts"
import LoadDetails from "./LoadDetails.vue"
import LoadMeter from "./LoadMeter.vue"

/**
 * The load as a small meter for a page header; a click opens the details. The history is only
 * fetched while the popover is open (and refreshed with each 5 s sample), so a closed indicator
 * costs nothing beyond the percentage the page already has.
 */
const props = defineProps<{ miniserverId: string; percent: number }>()
const { miniservers } = AppContext.use()
const open = ref(false)
const load = ref<MiniserverLoadDto>()

const fetchLoad = async () => {
  load.value = await miniservers.load(props.miniserverId)
}
const { pause, resume } = useIntervalFn(fetchLoad, 5000, { immediate: false })
watch(open, isOpen => {
  if (!isOpen) return pause()
  void fetchLoad()
  resume()
})
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger
      class="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent"
      :title="`Intercommunication load ${LoadLevel.format(load?.current.percent ?? percent)}: click for details`"
    >
      <span class="text-muted-foreground">Load</span>
      <LoadMeter :percent="load?.current.percent ?? percent" compact />
    </PopoverTrigger>
    <PopoverContent align="end" class="w-[min(34rem,calc(100vw-2rem))]">
      <LoadDetails v-if="load" :load="load" />
      <p v-else class="text-sm text-muted-foreground">Loading…</p>
    </PopoverContent>
  </Popover>
</template>
