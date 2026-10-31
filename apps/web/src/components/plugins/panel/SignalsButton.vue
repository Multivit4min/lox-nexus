<script setup lang="ts">
import { ListPlus } from "@lucide/vue"
import { Button } from "@/components/ui/button"

/** Opens the catalog at one node (a client, a device) to add its signals; `title` names it in the dialog. */
defineProps<{ catalog: string; title: string; browse: (id: string, title: string) => void }>()
</script>

<template>
  <Button size="sm" variant="outline" class="h-7" :title="`Add signals of ${title}`" @click="browse(catalog, title)">
    <ListPlus class="size-3.5" /> Signals
  </Button>
</template>
