<script setup lang="ts">
import { reactive, ref } from "vue"
import { DEFAULT_ICI_PORT, type MiniserverDto, type MiniserverInput } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ApiError } from "../api/ApiError.ts"
import FormField from "./FormField.vue"

/**
 * Create or edit a Miniserver. Encrypted intercommunication is not offered in the UI for now:
 * the form never sends a password, so one already stored (through the API) stays as it is.
 */
const props = defineProps<{ initial?: MiniserverDto; submit: (input: MiniserverInput) => Promise<void> }>()

const form = reactive({
  label: props.initial?.label ?? "",
  slug: props.initial?.slug ?? "",
  host: props.initial?.host ?? "",
  port: props.initial?.port ?? DEFAULT_ICI_PORT,
  listenPort: props.initial?.listenPort ?? DEFAULT_ICI_PORT,
  listenAddress: props.initial?.listenAddress ?? "",
  ownId: props.initial?.ownId ?? "",
  remoteId: props.initial?.remoteId ?? "",
  enabled: props.initial?.enabled ?? true,
  resendSeconds: (props.initial?.resendInterval ?? 10_000) / 1000
})
const failure = ref<ApiError>()
const busy = ref(false)

function input(): MiniserverInput {
  const { resendSeconds, listenAddress, ...rest } = form
  return {
    ...rest,
    port: Number(form.port), listenPort: Number(form.listenPort), resendInterval: Math.round(Number(resendSeconds) * 1000),
    ...(listenAddress ? { listenAddress } : {})
  }
}

async function onSubmit() {
  busy.value = true
  failure.value = undefined
  try {
    await props.submit(input())
  } catch (error) {
    failure.value = error instanceof ApiError ? error : new ApiError(0, String(error))
  } finally {
    busy.value = false
  }
}
const issue = (field: string) => failure.value?.issueFor(field)
</script>

<template>
  <form class="grid gap-4" @submit.prevent="onSubmit">
    <div class="grid grid-cols-2 gap-4">
      <FormField id="label" label="Name" :error="issue('label')"><Input id="label" v-model="form.label" required /></FormField>
      <FormField id="slug" label="Topic name" hint="loxone/<name>/…" :error="issue('slug')"><Input id="slug" v-model="form.slug" required /></FormField>
      <FormField id="host" label="Miniserver address" :error="issue('host')"><Input id="host" v-model="form.host" required /></FormField>
      <FormField id="port" label="Miniserver port" :error="issue('port')"><Input id="port" v-model="form.port" type="number" required /></FormField>
      <FormField id="ownId" label="Our ID" hint="the remote system's ID on the Miniserver" :error="issue('ownId')"><Input id="ownId" v-model="form.ownId" maxlength="8" required /></FormField>
      <FormField id="remoteId" label="Miniserver ID" :error="issue('remoteId')"><Input id="remoteId" v-model="form.remoteId" maxlength="8" required /></FormField>
      <FormField id="listenPort" label="Listen port" hint="can be shared by Miniservers with different IDs" :error="issue('listenPort')"><Input id="listenPort" v-model="form.listenPort" type="number" required /></FormField>
      <FormField id="listenAddress" label="Listen address" hint="empty: all interfaces" :error="issue('listenAddress')"><Input id="listenAddress" v-model="form.listenAddress" /></FormField>
      <FormField id="resend" label="Resend every (s)" hint="0 disables" :error="issue('resendInterval')"><Input id="resend" v-model="form.resendSeconds" type="number" step="0.1" min="0" /></FormField>
    </div>
    <div class="flex items-center gap-6 text-sm">
      <label class="flex items-center gap-2"><Switch v-model="form.enabled" /> Start automatically</label>
    </div>
    <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure.message }}</AlertDescription></Alert>
    <Button type="submit" :disabled="busy">{{ initial ? "Save" : "Add Miniserver" }}</Button>
  </form>
</template>
