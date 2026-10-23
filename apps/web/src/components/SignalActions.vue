<script setup lang="ts">
import { Lock, Pencil, Trash2, Unlock } from "@lucide/vue"
import { Button } from "@/components/ui/button"

/** The buttons at the end of a signal row: edit, force or release, delete. */
defineProps<{ label: string; forced: boolean; disabled?: boolean }>()
const emit = defineEmits<{ edit: []; force: []; release: []; remove: [] }>()
</script>

<template>
  <span class="flex justify-end gap-0.5">
    <Button size="icon" variant="ghost" class="size-7" :title="`Edit ${label}`" :disabled="disabled" @click="emit('edit')"><Pencil class="size-4" /></Button>
    <Button
      v-if="forced" size="icon" variant="ghost" class="size-7 text-amber-600 dark:text-amber-400" :title="`Release ${label}: back to the last received value`"
      :disabled="disabled" @click="emit('release')"
    >
      <Unlock class="size-4" />
    </Button>
    <Button v-else size="icon" variant="ghost" class="size-7" :title="`Force ${label}`" :disabled="disabled" @click="emit('force')"><Lock class="size-4" /></Button>
    <Button size="icon" variant="ghost" class="size-7" :title="`Delete ${label}`" :disabled="disabled" @click="emit('remove')"><Trash2 class="size-4" /></Button>
  </span>
</template>
