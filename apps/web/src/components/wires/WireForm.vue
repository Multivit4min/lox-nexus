<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue"
import type { SignalDto, SupportedTransformDto, WireDto, WireInputDto, WirePreviewDto } from "@lox-nexus/api"
import type { ValueType } from "@lox-nexus/plugin-sdk/values"
import { watchDebounced } from "@vueuse/core"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { AppContext } from "../../AppContext.ts"
import { ApiError } from "../../api/ApiError.ts"
import { ValueDraft } from "../../lib/ValueDraft.ts"
import { TransformDraft, type StepDraft, type ValueText } from "../../lib/wires/TransformDraft.ts"
import { WireTypes } from "../../lib/wires/WireTypes.ts"
import type { WireBoard } from "../../stores/WireBoard.ts"
import FormField from "../FormField.vue"
import SignalPicker from "./SignalPicker.vue"
import TransformList from "./TransformList.vue"
import WirePreviewBox from "./WirePreviewBox.vue"

/**
 * Creates or edits a wire: source, target, transforms and switches, with a live preview of what
 * the target would get. `preset` starts a new wire at a given signal.
 */
const props = defineProps<{ board: WireBoard; initial?: WireDto; preset?: { sourceId?: string; targetId?: string }; submit: (input: WireInputDto) => Promise<void> }>()
const { wires } = AppContext.use()

const label = ref(props.initial?.label ?? "")
const sourceId = ref(props.initial?.sourceId ?? props.preset?.sourceId ?? "")
const targetId = ref(props.initial?.targetId ?? props.preset?.targetId ?? "")
// a stored step this version doesn't know can't be edited; saving drops it, and the form says so
const known = (props.initial?.transforms ?? []).filter((step): step is SupportedTransformDto => step.op !== "unsupported")
const dropped = (props.initial?.transforms.length ?? 0) - known.length
// shallow: drafts are replaced, never changed in place
const steps = shallowRef<StepDraft[]>(known.map(step => TransformDraft.from(step)))
const enabled = ref(props.initial?.enabled ?? true)
const syncOnStart = ref(props.initial?.syncOnStart ?? false)
const failure = ref<string | undefined>(dropped ? `${dropped} unknown transform step(s) can't be edited here; saving removes them.` : undefined)
const busy = ref(false)

const all = computed(() => [...props.board.state.signals.values()])
const sources = computed(() => all.value.filter(signal => signal.direction === "source"))
const targets = computed(() => all.value.filter(signal => signal.direction === "target"))
const source = computed(() => props.board.state.signals.get(sourceId.value))
const target = computed(() => props.board.state.signals.get(targetId.value))
const taken = computed(() => {
  const fed = props.board.fedTargets()
  if (props.initial) fed.delete(props.initial.targetId)
  return fed
})
const ownerName = (signal: SignalDto) => props.board.ownerName(signal)

const parsed = computed(() => steps.value.map(step => TransformDraft.parse(step)))
const errors = computed(() => parsed.value.map(result => ("error" in result ? result.error : undefined)))
const transforms = computed(() => (parsed.value.every(result => "step" in result) ? parsed.value.map(result => (result as { step: SupportedTransformDto }).step) : undefined))
const outputType = computed(() => (source.value ? WireTypes.output(source.value.valueType, transforms.value ?? []) : undefined))
const unusual = computed(() => !!outputType.value && !!target.value && WireTypes.fit(outputType.value, target.value.valueType) === "unusual")

const tryValue = ref<ValueText>(ValueDraft.from(undefined))
// each answer remembers the steps it was for, so step values never sit next to other steps
const answer = shallowRef<{ steps: string; preview: WirePreviewDto }>()
const preview = computed(() => {
  const current = answer.value
  return current && transforms.value && current.steps === JSON.stringify(transforms.value) ? current.preview : undefined
})
const previewError = ref<string>()
let previewRun = 0

function resetTryValue() {
  const type = source.value?.valueType
  tryValue.value = ValueDraft.from(source.value?.current?.value, type && type !== "any" ? type as ValueType : "number")
}
watch(sourceId, resetTryValue, { immediate: true })

// answers can overtake each other; only the latest request's answer is shown
async function runPreview() {
  const run = ++previewRun
  const value = ValueDraft.parse(tryValue.value.type, tryValue.value.text)
  if (!transforms.value || "error" in value) {
    ;[answer.value, previewError.value] = [undefined, "error" in value ? value.error : "fix the transforms above first"]
    return
  }
  const steps = JSON.stringify(transforms.value)
  try {
    const result = await wires.preview({ value: value.value, transforms: transforms.value, ...(target.value ? { targetId: target.value.id } : {}) })
    if (run === previewRun) [answer.value, previewError.value] = [{ steps, preview: result }, undefined]
  } catch (error) {
    if (run === previewRun) [answer.value, previewError.value] = [undefined, error instanceof Error ? error.message : String(error)]
  }
}
watchDebounced([transforms, tryValue, targetId], runPreview, { debounce: 250, immediate: true })

async function onSubmit() {
  if (!source.value || !target.value) return void (failure.value = "Pick a source and a target.")
  if (!transforms.value) return void (failure.value = "Fix the transforms first.")
  busy.value = true
  failure.value = undefined
  try {
    const name = label.value.trim() || `${source.value.label} → ${target.value.label}`.slice(0, 200)
    await props.submit({ label: name, sourceId: source.value.id, targetId: target.value.id, transforms: transforms.value, enabled: enabled.value, syncOnStart: syncOnStart.value })
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
    if (error instanceof ApiError && error.issues.length) failure.value = error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="grid gap-4" @submit.prevent="onSubmit">
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField id="wireSource" label="From (source)" :hint="source ? `${ownerName(source)} · ${source.valueType}` : 'values coming in: Loxone inputs, plugin sensors'">
        <SignalPicker id="wireSource" v-model="sourceId" label="Source" :signals="sources" :value-type="steps.length ? undefined : target?.valueType" :owner-name="ownerName" placeholder="Choose a source" />
      </FormField>
      <FormField id="wireTarget" label="To (target)" :hint="target ? `${ownerName(target)} · ${target.valueType}` : 'Loxone outputs, plugin actuators'">
        <SignalPicker
          id="wireTarget" v-model="targetId" label="Target" :signals="targets" :value-type="outputType" :owner-name="ownerName" :taken="taken" placeholder="Choose a target"
        />
      </FormField>
    </div>
    <p v-if="unusual" class="text-xs text-amber-700 dark:text-amber-400">
      {{ outputType }} doesn't convert to {{ target?.valueType }} in a useful way; the target will mostly get default values. A transform can help.
    </p>
    <FormField id="wireLabel" label="Name" hint="optional; shown in the inspector and in warnings">
      <Input id="wireLabel" v-model="label" maxlength="200" :placeholder="source && target ? `${source.label} → ${target.label}` : ''" />
    </FormField>
    <div class="grid gap-2">
      <span class="text-sm font-medium">Transforms</span>
      <div class="max-h-[40vh] overflow-y-auto pr-1">
        <TransformList v-model="steps" :errors="errors" :preview="preview" />
      </div>
    </div>
    <WirePreviewBox v-model="tryValue" :source="source" :target="target" :preview="preview" :error="previewError" @reset="resetTryValue" />
    <div class="grid gap-2 text-sm">
      <label class="flex items-center gap-2"><Switch v-model="enabled" /> Enabled</label>
      <label class="flex items-center gap-2">
        <Switch v-model="syncOnStart" /> Send the last known value after a restart
        <span class="text-xs text-muted-foreground">(otherwise only new values)</span>
      </label>
    </div>
    <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
    <Button type="submit" :disabled="busy">{{ initial ? "Save" : "Create wire" }}</Button>
  </form>
</template>
