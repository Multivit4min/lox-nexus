<script setup lang="ts">
import { computed } from "vue"
import type { UpdateImpactDto } from "@lox-nexus/api"
import PluginStateBadge from "../PluginStateBadge.vue"

/** What switching versions does to existing instances: restarts, lost or changed capabilities, new required settings. */
const props = defineProps<{ impact: UpdateImpactDto }>()

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`
const quiet = computed(() => props.impact.removed.length + props.impact.retyped.length + props.impact.restored.length + props.impact.newRequiredConfig.length === 0)
</script>

<template>
  <div class="grid gap-3 text-sm">
    <div v-if="impact.instances.length">
      <p class="font-medium">Instances that restart on it</p>
      <ul class="mt-1 grid gap-1">
        <li v-for="instance in impact.instances" :key="instance.id" class="flex items-center gap-2">
          <PluginStateBadge :state="instance.state" :title="instance.lastError" /> {{ instance.label || instance.id }}
        </li>
      </ul>
    </div>
    <p v-else class="text-muted-foreground">No instance uses this plugin yet.</p>
    <div v-if="impact.removed.length">
      <p class="font-medium text-amber-700 dark:text-amber-400">No longer offered</p>
      <p class="text-xs text-muted-foreground">Their signals keep their wires and last value, but get no values until a version offers them again.</p>
      <ul class="mt-1 list-disc pl-5">
        <li v-for="change in impact.removed" :key="`${change.kind}:${change.capability}`">
          {{ change.kind }} <code>{{ change.capability }}</code> · {{ plural(change.signals, "signal") }}
        </li>
      </ul>
    </div>
    <div v-if="impact.restored.length">
      <p class="font-medium text-emerald-700 dark:text-emerald-400">Offered again</p>
      <p class="text-xs text-muted-foreground">These orphaned signals work again, with their wires.</p>
      <ul class="mt-1 list-disc pl-5">
        <li v-for="change in impact.restored" :key="`${change.kind}:${change.capability}`">
          {{ change.kind }} <code>{{ change.capability }}</code> · {{ plural(change.signals, "signal") }}
        </li>
      </ul>
    </div>
    <div v-if="impact.retyped.length">
      <p class="font-medium">Value type changes</p>
      <ul class="mt-1 list-disc pl-5">
        <li v-for="change in impact.retyped" :key="`${change.kind}:${change.capability}`">
          {{ change.kind }} <code>{{ change.capability }}</code>: {{ change.from }} → {{ change.to }} · {{ plural(change.signals, "signal") }}
        </li>
      </ul>
    </div>
    <div v-if="impact.newRequiredConfig.length">
      <p class="font-medium text-amber-700 dark:text-amber-400">New required settings</p>
      <p class="text-xs text-muted-foreground">Instances without them stop with an error until you fill them in.</p>
      <p class="mt-1"><code v-for="name in impact.newRequiredConfig" :key="name" class="mr-2">{{ name }}</code></p>
    </div>
    <p v-if="quiet && impact.instances.length" class="text-muted-foreground">Signals and settings stay as they are.</p>
  </div>
</template>
