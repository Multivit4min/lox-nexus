<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import FormField from "./FormField.vue"

/**
 * Export, optionally with the plugins' secret settings (tokens, passwords) sealed with a
 * passphrase. Without them the file can be shared; an import elsewhere then asks for them.
 */
const open = defineModel<boolean>("open", { required: true })
const emit = defineEmits<{ export: [passphrase: string | undefined] }>()
const withSecrets = ref(false)
const passphrase = ref("")
const repeated = ref("")

watch(open, isOpen => isOpen && ([withSecrets.value, passphrase.value, repeated.value] = [false, "", ""]))
const problem = computed(() => {
  if (!withSecrets.value) return undefined
  if (passphrase.value.length < 12) return "at least 12 characters"
  return passphrase.value === repeated.value ? undefined : "the two entries differ"
})

function submit() {
  if (problem.value) return
  emit("export", withSecrets.value ? passphrase.value : undefined)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Export the configuration</DialogTitle>
        <DialogDescription>Miniservers, signals, wires and plugin instances as a JSON file. Miniserver passwords and plugin storage (pairings) are never part of it.</DialogDescription>
      </DialogHeader>
      <form class="grid gap-4" @submit.prevent="submit">
        <label class="flex items-start gap-3 text-sm">
          <Checkbox v-model="withSecrets" class="mt-0.5" />
          <span class="grid gap-0.5">
            <span class="font-medium">Include the plugins' secret settings</span>
            <span class="text-xs text-muted-foreground">Tokens and passwords, encrypted with a passphrase you need again to import. Without them, enter them in each instance's settings after an import elsewhere.</span>
          </span>
        </label>
        <template v-if="withSecrets">
          <FormField id="exportPassphrase" label="Passphrase" hint="at least 12 characters; there is no way to recover it">
            <Input id="exportPassphrase" v-model="passphrase" type="password" autocomplete="new-password" />
          </FormField>
          <FormField id="exportRepeat" label="Passphrase again" :error="passphrase && repeated ? problem : undefined">
            <Input id="exportRepeat" v-model="repeated" type="password" autocomplete="new-password" />
          </FormField>
        </template>
        <Button type="submit" :disabled="!!problem">Export</Button>
      </form>
    </DialogContent>
  </Dialog>
</template>
