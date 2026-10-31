<script setup lang="ts">
import { computed } from "vue"
import { Check } from "@lucide/vue"

/** Several of a list's options, picked by toggling chips; the order follows the options. */
const props = defineProps<{ id: string; modelValue: unknown[]; options: Array<string | number | boolean>; labels?: Record<string, string> }>()
const emit = defineEmits<{ "update:modelValue": [value: string[]] }>()
const chosen = computed(() => new Set(props.modelValue.map(String)))

function toggle(option: string) {
  const next = new Set(chosen.value)
  if (next.has(option)) next.delete(option)
  else next.add(option)
  emit("update:modelValue", props.options.map(String).filter(candidate => next.has(candidate)))
}
</script>

<template>
  <div :id="id" class="flex flex-wrap gap-2" role="group">
    <button
      v-for="option in options.map(String)" :key="option" type="button" :aria-pressed="chosen.has(option)"
      :class="['inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors', chosen.has(option) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted']"
      @click="toggle(option)"
    >
      <Check v-if="chosen.has(option)" class="size-3.5" /> {{ labels?.[option] ?? option }}
    </button>
  </div>
</template>
