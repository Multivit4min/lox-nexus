<script setup lang="ts">
import { onMounted, ref } from "vue"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { Badge } from "@/components/ui/badge"
import { ValueTypeNames } from "../../lib/ValueTypeNames.ts"

/**
 * Step one of adding a signal: what the plugin offers, as a list with descriptions, split into
 * what reads from the device (sensors) and what controls it (actuators). Emits "kind:id".
 */
const props = defineProps<{ description: PluginDescription }>()
const emit = defineEmits<{ pick: [choice: string] }>()

const groups = [
  { kind: "sensor", title: "Read from the device", list: props.description.sensors },
  { kind: "actuator", title: "Control the device", list: props.description.actuators }
].filter(group => group.list.length)
const list = ref<HTMLElement>()
// also after "Change": the button that was focused is gone
onMounted(() => list.value?.querySelector("button")?.focus())
</script>

<template>
  <div ref="list" class="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
    <p class="text-sm text-muted-foreground">Pick what to add. If the plugin has a catalog, "Add from catalog" is quicker for what it found on the device.</p>
    <section v-for="group in groups" :key="group.kind" class="grid gap-1.5">
      <h3 class="text-sm font-medium">{{ group.title }} <span class="font-normal text-muted-foreground">· {{ group.kind }}s</span></h3>
      <button
        v-for="capability in group.list" :key="capability.id" type="button"
        class="grid gap-0.5 rounded-md border px-3 py-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        @click="emit('pick', `${group.kind}:${capability.id}`)"
      >
        <span class="flex items-center gap-2 text-sm font-medium">{{ capability.label }} <Badge as="span" variant="outline" class="font-normal">{{ ValueTypeNames.of(capability.valueType) }}</Badge></span>
        <span v-if="capability.description" class="text-xs text-muted-foreground">{{ capability.description }}</span>
      </button>
    </section>
    <p v-if="!groups.length" class="text-sm text-muted-foreground">This plugin offers no sensors or actuators.</p>
  </div>
</template>
