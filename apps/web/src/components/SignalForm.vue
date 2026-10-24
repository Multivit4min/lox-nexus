<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { LumitechRule, type LoxoneSignalDto, type LoxoneSignalInput } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ApiError } from "../api/ApiError.ts"
import { DataTypes } from "../lib/DataTypes.ts"
import FormField from "./FormField.vue"

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
  slug: props.initial?.slug ?? "",
  lumitech: props.initial?.lumitech ?? false
})
const failure = ref<ApiError>()
const lumitechPossible = computed(() => LumitechRule.allowed(Number(form.dataType), form.direction))

async function onSubmit() {
  failure.value = undefined
  try {
    const { slug, dataType, lumitech, ...rest } = form
    await props.submit({
      ...rest, dataType: Number(dataType) as LoxoneSignalInput["dataType"], label: form.label || form.packetId,
      ...(slug ? { slug } : {}), ...(lumitech && lumitechPossible.value ? { lumitech: true } : {})
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
    <label v-if="lumitechPossible" class="flex items-start gap-3 text-sm">
      <Switch v-model="form.lumitech" class="mt-0.5" />
      <span class="grid gap-0.5">
        <span class="font-medium">Lumitech colour</span>
        <span class="text-xs text-muted-foreground">
          The value is a Lighting Controller's Lumitech output: a colour temperature (e.g. 200504000 = 4000 K at 50 %) or an RGB colour.
          It shows and wires as a colour temperature or colour instead of a number. Wire it to Lumitech outputs or colour-aware targets:
          a plain Analog output would get a brightness, not the colour number.
        </span>
      </span>
    </label>
    <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure.message }}</AlertDescription></Alert>
    <p v-if="initial" class="text-xs text-muted-foreground">
      Wires stay connected. A new packet ID, direction or topic name moves the signal to a new topic; its last value and any force move with it.
    </p>
    <Button type="submit">{{ initial ? "Save" : "Add signal" }}</Button>
  </form>
</template>
