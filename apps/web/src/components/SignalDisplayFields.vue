<script setup lang="ts">
import { Input } from "@/components/ui/input"
import FormField from "./FormField.vue"

/**
 * Unit and decimals of a number signal, and for a source the minutes after which it warns that it
 * went quiet (as text, empty for "not set"). None of them changes values on the bus.
 */
defineProps<{ idPrefix: string; numeric: boolean; source: boolean; error?: string | undefined; staleError?: string | undefined }>()
const unit = defineModel<string>("unit", { required: true })
const decimals = defineModel<string>("decimals", { required: true })
const stale = defineModel<string>("stale", { required: true })
</script>

<template>
  <div v-if="numeric || source" class="grid gap-4 sm:grid-cols-2">
    <template v-if="numeric">
      <FormField :id="`${idPrefix}Unit`" label="Unit" hint="optional, shown after the value, e.g. W or °C">
        <Input :id="`${idPrefix}Unit`" v-model="unit" maxlength="16" />
      </FormField>
      <FormField :id="`${idPrefix}Decimals`" label="Decimals" hint="optional, 0 to 6; empty shows the value as it is" :error="error">
        <Input :id="`${idPrefix}Decimals`" v-model="decimals" type="number" min="0" max="6" step="1" inputmode="numeric" />
      </FormField>
    </template>
    <FormField v-if="source" :id="`${idPrefix}Stale`" label="Warn when no value for (min)" hint="optional; an unchanged value counts. Empty: never" :error="staleError">
      <Input :id="`${idPrefix}Stale`" v-model="stale" type="number" min="1" max="10080" step="1" inputmode="numeric" />
    </FormField>
  </div>
</template>
