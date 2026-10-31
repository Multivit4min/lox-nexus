<script setup lang="ts">
import { ref } from "vue"
import { FileUp, X } from "@lucide/vue"
import { Button } from "@/components/ui/button"

/**
 * A file the plugin takes as text (a certificate) or base64 (binary): picked, checked against the
 * size limit here, and kept as its contents. A value already set shows as such.
 */
// placeholder: what an empty field means, e.g. that a stored secret is kept
const props = defineProps<{ id: string; modelValue: string; maxBytes: number; base64: boolean; accept?: string; placeholder?: string }>()
const emit = defineEmits<{ "update:modelValue": [value: string] }>()
const picked = ref<string>()
const problem = ref<string>()
const input = ref<HTMLInputElement>()

async function choose(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  problem.value = undefined
  if (!file) return
  if (file.size > props.maxBytes) {
    problem.value = `${file.name} is ${Math.ceil(file.size / 1024)} KiB; at most ${Math.floor(props.maxBytes / 1024)} KiB`
    return
  }
  const contents = props.base64 ? toBase64(new Uint8Array(await file.arrayBuffer())) : await file.text()
  picked.value = `${file.name} (${file.size} bytes)`
  emit("update:modelValue", contents)
}

// in slices: spreading a large file into one call would overflow the stack
function toBase64(bytes: Uint8Array) {
  let binary = ""
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(binary)
}

function clear() {
  picked.value = undefined
  if (input.value) input.value.value = ""
  emit("update:modelValue", "")
}
</script>

<template>
  <div class="grid gap-1">
    <div class="flex flex-wrap items-center gap-2">
      <input :id="id" ref="input" type="file" class="sr-only" :accept="accept" @change="choose" />
      <Button type="button" variant="outline" size="sm" @click="input?.click()"><FileUp class="size-4" /> Choose file</Button>
      <span class="text-sm text-muted-foreground">{{ picked ?? (modelValue ? `set (${modelValue.length} characters)` : placeholder || "none") }}</span>
      <Button v-if="modelValue" type="button" size="icon" variant="ghost" class="size-7" title="Remove the file" @click="clear"><X class="size-4" /></Button>
    </div>
    <p v-if="problem" class="text-xs text-destructive">{{ problem }}</p>
  </div>
</template>
