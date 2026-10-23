<script setup lang="ts">
import { computed } from "vue"
import { ValueFormatter, type Value } from "@lox-nexus/plugin-sdk/values"

/** A bus value as text; colours get a swatch so RGBW values can be recognised at a glance. */
const props = defineProps<{ value?: Value }>()
const formatter = new ValueFormatter()

const text = computed(() => formatter.format(props.value))
const swatch = computed(() => {
  if (props.value?.type !== "rgbw") return undefined
  const { red, green, blue } = props.value.value
  return `rgb(${red * 2.55} ${green * 2.55} ${blue * 2.55})`
})
</script>

<template>
  <span class="inline-flex items-center gap-1.5 font-mono text-xs">
    <span v-if="swatch" class="inline-block size-3 rounded-sm border" :style="{ background: swatch }"></span>
    {{ text }}
  </span>
</template>
