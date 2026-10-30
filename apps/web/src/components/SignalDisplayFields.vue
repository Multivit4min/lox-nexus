<script setup lang="ts">
import { Input } from "@/components/ui/input"
import FormField from "./FormField.vue"

/** Unit and decimals of a signal (as text, empty for "not set"), for numbers; only for display, values on the bus stay exact. */
defineProps<{ idPrefix: string; error?: string | undefined }>()
const unit = defineModel<string>("unit", { required: true })
const decimals = defineModel<string>("decimals", { required: true })
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <FormField :id="`${idPrefix}Unit`" label="Unit" hint="optional, shown after the value, e.g. W or °C">
      <Input :id="`${idPrefix}Unit`" v-model="unit" maxlength="16" />
    </FormField>
    <FormField :id="`${idPrefix}Decimals`" label="Decimals" hint="optional, 0 to 6; empty shows the value as it is" :error="error">
      <Input :id="`${idPrefix}Decimals`" v-model="decimals" type="number" min="0" max="6" step="1" inputmode="numeric" />
    </FormField>
  </div>
</template>
