<script setup lang="ts">
import { reactive, ref } from "vue"
import type { LoxoneSignalInput } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ApiError } from "../api/ApiError.ts"
import { DataTypes } from "../lib/DataTypes.ts"
import FormField from "./FormField.vue"

/** A new Loxone signal: in = Miniserver → Nexus (a "virtual output" in Loxone Config), out = Nexus → Miniserver. */
const props = defineProps<{ submit: (input: LoxoneSignalInput) => Promise<void> }>()

const form = reactive({ packetId: "", direction: "in" as "in" | "out", dataType: "1", label: "", slug: "" })
const failure = ref<ApiError>()

async function onSubmit() {
  failure.value = undefined
  try {
    const { slug, dataType, ...rest } = form
    await props.submit({ ...rest, dataType: Number(dataType) as LoxoneSignalInput["dataType"], label: form.label || form.packetId, ...(slug ? { slug } : {}) })
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
    <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure.message }}</AlertDescription></Alert>
    <Button type="submit">Add signal</Button>
  </form>
</template>
