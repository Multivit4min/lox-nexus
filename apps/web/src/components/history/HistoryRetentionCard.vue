<script setup lang="ts">
import { ref, watch } from "vue"
import type { HistorySettings, HistorySettingsInput } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import FormField from "../FormField.vue"

/** How long each level of detail is kept, and how close together changes are kept one by one. */
const props = defineProps<{ settings: HistorySettings; save: (input: Partial<HistorySettingsInput>) => Promise<void> }>()
const draft = ref({ ...props.settings })
const failure = ref<string>()
const busy = ref(false)
watch(() => props.settings, settings => (draft.value = { ...settings }))

const FIELDS = [
  { key: "rawDays", label: "Every change (days)", hint: "For charts of the last days" },
  { key: "fineDays", label: "5-minute averages (days)", hint: "Lowest, highest and average per 5 minutes" },
  { key: "coarseDays", label: "Hourly averages (days)", hint: "For months and years" }
] as const

async function submit() {
  busy.value = true
  failure.value = undefined
  try {
    const { rawDays, fineDays, coarseDays, rawMinIntervalMs } = draft.value
    await props.save({ rawDays: Number(rawDays), fineDays: Number(fineDays), coarseDays: Number(coarseDays), rawMinIntervalMs: Number(rawMinIntervalMs) })
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>How long it is kept</CardTitle>
      <CardDescription>0 keeps forever. Older data is deleted bit by bit, every minute.</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="submit">
        <FormField v-for="field in FIELDS" :id="field.key" :key="field.key" :label="field.label" :hint="field.hint">
          <Input :id="field.key" v-model="draft[field.key]" type="number" min="0" required />
        </FormField>
        <FormField id="rawMinIntervalMs" label="Changes closer than (ms)" hint="keep only the latest of them one by one; averages see all">
          <Input id="rawMinIntervalMs" v-model="draft.rawMinIntervalMs" type="number" min="0" required />
        </FormField>
        <Alert v-if="failure" variant="destructive" class="sm:col-span-2"><AlertDescription>{{ failure }}</AlertDescription></Alert>
        <div class="sm:col-span-2"><Button type="submit" :disabled="busy">Save</Button></div>
      </form>
    </CardContent>
  </Card>
</template>
