<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import type { LoxoneSignalDto, LoxoneSignalInput } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ApiError } from "../api/ApiError.ts"
import { DataTypes } from "../lib/DataTypes.ts"
import { SignalDisplayDraft } from "../lib/SignalDisplayDraft.ts"
import FormField from "./FormField.vue"
import SignalDisplayFields from "./SignalDisplayFields.vue"

/**
 * Creates or edits a Loxone signal: in = Miniserver → Nexus (a "virtual output" in Loxone Config),
 * out = Nexus → Miniserver. Editing keeps the signal's wires.
 */
const props = defineProps<{ initial?: LoxoneSignalDto; submit: (input: LoxoneSignalInput) => Promise<void> }>()

const form = reactive({
  packetId: props.initial?.packetId ?? "",
  direction: props.initial?.direction ?? "in" as "in" | "out",
  dataType: String(props.initial?.dataType ?? 1),
  label: props.initial?.label ?? "",
  slug: props.initial?.slug ?? ""
})
const display = reactive(new SignalDisplayDraft(props.initial))
const failure = ref<ApiError>()
// units and decimals are for numbers
const numeric = computed(() => form.dataType === "1")

async function onSubmit() {
  failure.value = undefined
  try {
    const { slug, dataType, ...rest } = form
    await props.submit({
      ...rest, dataType: Number(dataType) as LoxoneSignalInput["dataType"], label: form.label || form.packetId,
      ...(slug ? { slug } : {}), ...(numeric.value ? display.input() : {}), ...(form.direction === "in" ? display.staleInput() : {})
    })
  } catch (error) {
    failure.value = error instanceof ApiError ? error : new ApiError(0, String(error))
  }
}
</script>

<template>
  <form class="grid gap-4" @submit.prevent="onSubmit">
    <div class="grid grid-cols-2 gap-4">
      <FormField id="packetId" label="Packet ID" hint="as in Loxone Config, max. 8 characters" :error="failure?.issueFor('packetId')">
        <Input id="packetId" v-model="form.packetId" maxlength="8" required />
      </FormField>
      <FormField id="label" label="Name"><Input id="label" v-model="form.label" :placeholder="form.packetId" /></FormField>
      <FormField id="direction" label="Direction">
        <Select v-model="form.direction">
          <SelectTrigger id="direction"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="in">in: from the Miniserver</SelectItem>
            <SelectItem value="out">out: to the Miniserver</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <FormField id="dataType" label="Data type">
        <Select v-model="form.dataType">
          <SelectTrigger id="dataType"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="type in DataTypes.ALL" :key="type.id" :value="String(type.id)">{{ type.name }}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <FormField id="slug" label="Topic name" hint="optional, defaults to the packet ID" :error="failure?.issueFor('slug')">
        <Input id="slug" v-model="form.slug" />
      </FormField>
    </div>
    <SignalDisplayFields
      v-model:unit="display.unit" v-model:decimals="display.decimals" v-model:stale="display.staleAfterMin" id-prefix="signal"
      :numeric="numeric" :source="form.direction === 'in'" :error="failure?.issueFor('decimals')" :stale-error="failure?.issueFor('staleAfterMin')"
    />
    <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure.message }}</AlertDescription></Alert>
    <p v-if="initial" class="text-xs text-muted-foreground">
      Wires stay connected. A new packet ID, direction or topic name moves the signal to a new topic; its last value and any force move with it.
    </p>
    <Button type="submit">{{ initial ? "Save" : "Add signal" }}</Button>
  </form>
</template>
