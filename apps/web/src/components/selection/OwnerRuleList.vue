<script setup lang="ts">
import type { SelectionDto, SelectionRulesUpdate } from "@lox-nexus/api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** A Miniserver or plugin instance, whose signals a rule can take or leave as a whole. */
export interface RuleOwner {
  kind: "miniserver" | "plugin"
  id: string
  label: string
}

/** One row per Miniserver and plugin instance: as the mode says, all its signals, or none. */
const props = defineProps<{ selection: SelectionDto; owners: RuleOwner[]; allLabel: string; noneLabel: string }>()
const emit = defineEmits<{ rules: [rules: SelectionRulesUpdate] }>()

const ownerRule = (owner: RuleOwner) => {
  const rule = props.selection.rules.find(({ target }) => owner.kind === "miniserver" ? "miniserverId" in target && target.miniserverId === owner.id : "instanceId" in target && target.instanceId === owner.id)
  return rule === undefined ? "follow" : rule.include ? "all" : "none"
}

function setOwner(owner: RuleOwner, choice: unknown) {
  const target = owner.kind === "miniserver" ? { miniserverId: owner.id } : { instanceId: owner.id }
  emit("rules", [{ target, include: choice === "follow" ? null : choice === "all" }])
}
</script>

<template>
  <ul class="divide-y rounded-md border text-sm">
    <li v-for="owner in owners" :key="`${owner.kind}${owner.id}`" class="flex flex-wrap items-center gap-2 px-3 py-2">
      <span class="min-w-0 flex-1 truncate">{{ owner.label }} <span class="text-xs text-muted-foreground">{{ owner.kind === "miniserver" ? "Miniserver" : "plugin" }}</span></span>
      <Select :model-value="ownerRule(owner)" @update:model-value="v => setOwner(owner, v)">
        <SelectTrigger class="h-8 w-56" :aria-label="`${owner.label}: which signals`"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="follow">As set above</SelectItem>
          <SelectItem value="all">{{ allLabel }}</SelectItem>
          <SelectItem value="none">{{ noneLabel }}</SelectItem>
        </SelectContent>
      </Select>
    </li>
    <li v-if="owners.length === 0" class="px-3 py-2 text-muted-foreground">No Miniservers or plugin instances yet.</li>
  </ul>
</template>
