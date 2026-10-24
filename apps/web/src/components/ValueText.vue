<script setup lang="ts">
import { computed } from "vue"
import { ValueFormatter, type Value } from "@lox-nexus/plugin-sdk/values"

/** A bus value as text; colours get a swatch so RGBW values can be recognised at a glance. */
const props = defineProps<{ value?: Value }>()
const formatter = new ValueFormatter()

const text = computed(() => formatter.format(props.value))
const swatch = computed(() => {
  if (props.value?.type !== "rgbw") return undefined
  // the white channel lightens every colour; without it a pure-white mood (w80) would look black
  const { red, green, blue, white } = props.value.value
  const channel = (value: number) => Math.min(100, value + white) * 2.55
  return `rgb(${channel(red)} ${channel(green)} ${channel(blue)})`
})
</script>

<template>
  <span class="inline-flex items-center gap-1.5 font-mono text-xs">
    <span v-if="swatch" class="inline-block size-3 rounded-sm border" :style="{ background: swatch }"></span>
    {{ text }}
  </span>
</template>
