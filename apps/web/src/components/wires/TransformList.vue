<script setup lang="ts">
import { ref } from "vue"
import type { WirePreviewDto } from "@lox-nexus/api"
import { ArrowDown, ArrowUp, X } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { STEP_OPS, TransformDraft, type StepDraft, type StepOp } from "../../lib/wires/TransformDraft.ts"
import ValueText from "../ValueText.vue"
import TransformStep from "./TransformStep.vue"

/**
 * The ordered transform steps of a wire. Each step shows what it makes of the preview value, or
 * what to fix. Steps are drafts; the form parses them before saving.
 */
const props = defineProps<{ modelValue: StepDraft[]; errors: Array<string | undefined>; preview?: WirePreviewDto }>()
const emit = defineEmits<{ "update:modelValue": [value: StepDraft[]] }>()
const adding = ref<StepOp | "">("")

const labelOf = (op: StepOp) => STEP_OPS.find(entry => entry.op === op)!
const set = (steps: StepDraft[]) => emit("update:modelValue", steps)
const replace = (index: number, step: StepDraft) => set(props.modelValue.map((current, i) => (i === index ? step : current)))

function move(index: number, by: -1 | 1) {
  const steps = [...props.modelValue]
  const [step] = steps.splice(index, 1)
  steps.splice(index + by, 0, step!)
  set(steps)
}

function add(op: StepOp) {
  set([...props.modelValue, TransformDraft.create(op)])
  // back to the placeholder, so the same step can be added again
  adding.value = ""
}
</script>

<template>
  <div class="grid gap-2">
    <p v-if="modelValue.length === 0" class="text-sm text-muted-foreground">No transforms: values are only converted to the target's type.</p>
    <div v-for="(step, i) in modelValue" :key="i" class="grid gap-2 rounded-md border p-2.5">
      <div class="flex items-center gap-2">
        <span class="text-xs text-muted-foreground tabular-nums">{{ i + 1 }}</span>
        <span class="text-sm font-medium" :title="labelOf(step.op).help">{{ labelOf(step.op).label }}</span>
        <span class="hidden truncate text-xs text-muted-foreground sm:inline">{{ labelOf(step.op).help }}</span>
        <span class="ml-auto flex shrink-0 gap-0.5">
          <Button type="button" size="icon" variant="ghost" class="size-7" title="Move up" :disabled="i === 0" @click="move(i, -1)"><ArrowUp class="size-4" /></Button>
          <Button type="button" size="icon" variant="ghost" class="size-7" title="Move down" :disabled="i === modelValue.length - 1" @click="move(i, 1)"><ArrowDown class="size-4" /></Button>
          <Button type="button" size="icon" variant="ghost" class="size-7" :title="`Remove step ${i + 1}`" @click="set(modelValue.filter((_, j) => j !== i))"><X class="size-4" /></Button>
        </span>
      </div>
      <TransformStep :id="`step-${i}`" :model-value="step" @update:model-value="value => replace(i, value)" />
      <p v-if="errors[i]" class="text-xs text-destructive">{{ errors[i] }}</p>
      <p v-else-if="preview?.steps[i]" class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        gives <ValueText :value="preview.steps[i].value" />
        <span v-if="preview.steps[i].note">· {{ preview.steps[i].note }}</span>
      </p>
    </div>
    <Select :model-value="adding" @update:model-value="op => op && add(op as StepOp)">
      <SelectTrigger class="h-8 w-44"><SelectValue placeholder="Add a transform" /></SelectTrigger>
      <SelectContent>
        <SelectItem v-for="entry in STEP_OPS" :key="entry.op" :value="entry.op">{{ entry.label }}</SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
