<script setup lang="ts">
import { computed } from "vue"
import { ValueFormatter, type Value } from "@lox-nexus/plugin-sdk/values"
import { Swatch } from "../lib/Swatch.ts"

/** A bus value as text; colours and colour temperatures get a swatch, so they can be recognised at a glance. */
const props = defineProps<{ value?: Value }>()
const formatter = new ValueFormatter()

const text = computed(() => formatter.format(props.value))
const swatch = computed(() => Swatch.of(props.value))
</script>

<template>
  <span class="inline-flex items-center gap-1.5 font-mono text-xs">
    <span v-if="swatch" class="inline-block size-3 rounded-sm border" :style="{ background: swatch }"></span>
    {{ text }}
  </span>
</template>
