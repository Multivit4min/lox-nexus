<script setup lang="ts">
import { ref } from "vue"
import type { UnloadableRowDto } from "@lox-nexus/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { MiniserverApi } from "../api/MiniserverApi.ts"

/**
 * Stored Miniservers and signals the server couldn't load (written by a newer version, say). They
 * don't run; deleting them is the only thing to do here, short of going back to that version.
 */
const props = defineProps<{ rows: UnloadableRowDto[]; api: MiniserverApi }>()
const emit = defineEmits<{ changed: [] }>()
const failure = ref<string>()

async function remove(row: UnloadableRowDto) {
  const what = row.kind === "miniserver" ? `the Miniserver "${row.label}" with all its signals and wires` : `the signal "${row.label}" and its wires`
  if (!confirm(`Delete ${what}?`)) return
  failure.value = undefined
  try {
    if (row.kind === "miniserver") await props.api.remove(row.id)
    else await props.api.removeSignal(row.miniserverId ?? "", row.id)
    emit("changed")
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <Alert variant="destructive">
    <AlertTitle>Stored entries that can't be loaded</AlertTitle>
    <AlertDescription class="grid gap-2">
      <p>These were saved by another version of Nexus and don't run. Delete them, or start the version that wrote them.</p>
      <ul class="grid gap-1">
        <li v-for="row in rows" :key="row.id" class="flex flex-wrap items-center gap-2">
          <span class="font-medium">{{ row.kind === "miniserver" ? "Miniserver" : "Signal" }} "{{ row.label }}"</span>
          <span class="text-xs break-all">{{ row.error }}</span>
          <Button size="sm" variant="outline" class="ml-auto" @click="remove(row)">Delete</Button>
        </li>
      </ul>
      <p v-if="failure">{{ failure }}</p>
    </AlertDescription>
  </Alert>
</template>
