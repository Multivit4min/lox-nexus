<script setup lang="ts">
import { computed, shallowRef, watch } from "vue"

/** A QR code of `data` (e.g. a Matter pairing payload), drawn as SVG; the encoder loads on first use. */
const props = defineProps<{ data: string; caption?: string }>()
const matrix = shallowRef<boolean[][]>()
const failed = shallowRef(false)

watch(() => props.data, async data => {
  try {
    const { encode } = await import("uqr")
    matrix.value = encode(data, { border: 2 }).data
    failed.value = false
  } catch {
    // never leave the previous code standing next to the new data
    matrix.value = undefined
    failed.value = true
  }
}, { immediate: true })

// one path of unit squares; crispEdges keeps the modules sharp at any size
const path = computed(() => (matrix.value ?? []).flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : []))).join(""))
</script>

<template>
  <figure class="grid justify-items-start gap-2">
    <svg
      v-if="matrix" :viewBox="`0 0 ${matrix.length} ${matrix.length}`" class="size-44 rounded-md bg-white" shape-rendering="crispEdges"
      role="img" :aria-label="caption ?? 'QR code'"
    >
      <path :d="path" fill="black" />
    </svg>
    <p v-else-if="failed" class="text-sm text-destructive">The QR code can't be drawn.</p>
    <figcaption class="max-w-md text-sm text-muted-foreground">
      {{ caption }} <span class="block font-mono text-xs break-all">{{ data }}</span>
    </figcaption>
  </figure>
</template>
