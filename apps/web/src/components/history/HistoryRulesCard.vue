<script setup lang="ts">
import { computed } from "vue"
import type { SelectionDto, SelectionRulesUpdate, SignalDto } from "@lox-nexus/api"
import { X } from "@lucide/vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import OwnerRuleList, { type RuleOwner } from "../selection/OwnerRuleList.vue"

/**
 * Exceptions to "all" or "selected": whole Miniservers and plugin instances, and single signals
 * (set from the signal lists). A rule on a signal beats one on its owner.
 */
const props = defineProps<{ selection: SelectionDto; owners: RuleOwner[]; signals: SignalDto[] }>()
const emit = defineEmits<{ rules: [rules: SelectionRulesUpdate] }>()

const signalRules = computed(() => props.selection.rules.flatMap(({ target, include }) => {
  if (!("signalId" in target)) return []
  const signal = props.signals.find(s => s.id === target.signalId)
  return [{ id: target.signalId, label: signal?.label ?? target.signalId, owner: props.owners.find(o => o.id === signal?.owner?.id)?.label ?? "", include }]
}))
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Exceptions</CardTitle>
      <CardDescription>Take or leave all signals of a Miniserver or plugin instance. Single signals are switched on and off in their lists, with the chart button.</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      <OwnerRuleList :selection="selection" :owners="owners" all-label="Record all its signals" none-label="Record none of its signals" @rules="rules => emit('rules', rules)" />
      <div v-if="signalRules.length" class="grid gap-1.5">
        <h3 class="text-sm font-medium">Single signals</h3>
        <ul class="divide-y rounded-md border text-sm">
          <li v-for="rule in signalRules" :key="rule.id" class="flex items-center gap-2 px-3 py-1.5">
            <span class="min-w-0 flex-1 truncate">{{ rule.label }} <span class="text-xs text-muted-foreground">{{ rule.owner }}</span></span>
            <Badge variant="outline">{{ rule.include ? "recorded" : "not recorded" }}</Badge>
            <Button size="icon" variant="ghost" class="size-7" :title="`Remove the exception for ${rule.label}`" @click="emit('rules', [{ target: { signalId: rule.id }, include: null }])">
              <X class="size-4" />
            </Button>
          </li>
        </ul>
      </div>
    </CardContent>
  </Card>
</template>
