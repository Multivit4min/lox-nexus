<script setup lang="ts">
import { ref, watch } from "vue"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import FormField from "./FormField.vue"

/** Asks for the passphrase of an import file that holds the plugins' sealed secret settings. */
const props = defineProps<{ fileName: string }>()
const open = defineModel<boolean>("open", { required: true })
const emit = defineEmits<{ passphrase: [passphrase: string] }>()
const passphrase = ref("")
watch(open, isOpen => isOpen && (passphrase.value = ""))

function submit() {
  if (!passphrase.value) return
  emit("passphrase", passphrase.value)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Passphrase</DialogTitle>
        <DialogDescription>{{ props.fileName }} holds the plugins' secret settings, encrypted with the passphrase chosen at the export.</DialogDescription>
      </DialogHeader>
      <form class="grid gap-4" @submit.prevent="submit">
        <FormField id="importPassphrase" label="Passphrase">
          <Input id="importPassphrase" v-model="passphrase" type="password" autocomplete="off" />
        </FormField>
        <Button type="submit" :disabled="!passphrase">Import</Button>
      </form>
    </DialogContent>
  </Dialog>
</template>
