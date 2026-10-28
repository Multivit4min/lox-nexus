<script setup lang="ts">
import { ref } from "vue"
import { ChartLine } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { AppContext } from "../../AppContext.ts"

/** Bulk actions for ticked signals: record their history, or stop recording it (a rule per signal). */
const props = defineProps<{ ids: string[] }>()
const { recorded } = AppContext.use()
const busy = ref(false)

async function set(record: boolean) {
  busy.value = true
  try {
    await recorded.set(props.ids, record)
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Button size="sm" variant="outline" class="h-8" :disabled="busy" @click="set(true)"><ChartLine class="size-4" /> Record {{ ids.length }}</Button>
  <Button size="sm" variant="ghost" class="h-8" :disabled="busy" @click="set(false)">Stop recording</Button>
</template>
