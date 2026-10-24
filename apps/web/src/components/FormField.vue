<script setup lang="ts">
import { Label } from "@/components/ui/label"

/** A label, the input in the slot, and an optional hint or error below it. */
defineProps<{ id: string; label: string; error?: string; hint?: string }>()
</script>

<template>
  <div class="grid content-start gap-1.5">
    <Label :for="id">{{ label }}</Label>
    <slot></slot>
    <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
    <p v-else-if="hint" class="text-xs text-muted-foreground">{{ hint }}</p>
  </div>
</template>
