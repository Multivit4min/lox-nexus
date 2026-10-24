<script setup lang="ts">
import type { SignalDto, WirePreviewDto } from "@lox-nexus/api"
import { ArrowRight, RotateCcw } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import type { ValueText as ValueTextDraft } from "../../lib/wires/TransformDraft.ts"
import ValueText from "../ValueText.vue"
import ValueTextInput from "./ValueTextInput.vue"

/**
 * The value the preview runs through the wire (the source's current value, or one typed in) and
 * what the target would get from it.
 */
defineProps<{ source?: SignalDto; target?: SignalDto; preview?: WirePreviewDto; error?: string }>()
const value = defineModel<ValueTextDraft>({ required: true })
const emit = defineEmits<{ reset: [] }>()
</script>

<template>
  <div class="grid gap-2 rounded-md bg-muted/50 p-3 text-sm">
    <div class="flex flex-wrap items-center gap-2">
      <span class="w-24 shrink-0 text-muted-foreground">Try with</span>
      <ValueTextInput v-model="value" label="preview value" />
      <Button
        v-if="source?.current?.value" type="button" size="icon" variant="ghost" class="size-8" title="Back to the source's current value"
        @click="emit('reset')"
      >
        <RotateCcw class="size-4" />
      </Button>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="w-24 shrink-0 text-muted-foreground">{{ target ? "Target gets" : "Result" }}</span>
      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
      <template v-else-if="preview">
        <ArrowRight class="size-4 text-muted-foreground" />
        <ValueText :value="preview.delivered" />
        <span v-if="target" class="text-xs text-muted-foreground">as {{ target.valueType }}</span>
      </template>
      <span v-else class="text-xs text-muted-foreground">…</span>
    </div>
  </div>
</template>
