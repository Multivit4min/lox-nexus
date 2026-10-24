<script setup lang="ts">
import { ref } from "vue"
import { Download, Upload } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { AppContext } from "../AppContext.ts"
import { ApiError } from "../api/ApiError.ts"
import { JsonFile } from "../lib/JsonFile.ts"

/**
 * Export the whole configuration (Miniservers, signals, wires) as a JSON file, or replace it with
 * one. Passwords are not part of the file. The outcome is reported through `result`.
 */
const emit = defineEmits<{ result: [outcome: { ok: boolean; text: string }]; changed: [] }>()
const { config } = AppContext.use()
const picker = ref<HTMLInputElement>()
const busy = ref(false)

async function run(work: () => Promise<string>) {
  busy.value = true
  try {
    emit("result", { ok: true, text: await work() })
  } catch (error) {
    emit("result", { ok: false, text: error instanceof ApiError || error instanceof SyntaxError ? error.message : String(error) })
  } finally {
    busy.value = false
  }
}

function exportConfig() {
  return run(async () => {
    const doc = await config.export()
    JsonFile.save(`lox-nexus-config-${doc.exportedAt?.slice(0, 10) ?? "export"}.json`, doc)
    return `Exported ${doc.miniservers.length} Miniserver(s) and ${doc.wires.length} wire(s). Passwords are not included.`
  })
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // cleared so that choosing the same file again fires another change event
  input.value = ""
  if (!file) return
  const question = `Replace the whole configuration with ${file.name}?\n\nAll Miniservers, signals and wires are replaced; forces and last values on them are dropped. Wires between a Miniserver and a plugin are not part of the file and are removed. If anything fails, the current configuration is restored (without its forces and values).`
  if (!confirm(question)) return
  await run(async () => {
    try {
      const result = await config.import(await JsonFile.read(file))
      const kept = result.keptPasswords.length ? ` ${result.keptPasswords.length} kept their stored password.` : ""
      const inactive = result.inactiveWires ? ` ${result.inactiveWires} wire(s) can't run and are listed as inactive.` : ""
      return `Imported ${result.miniservers} Miniserver(s), ${result.signals} signal(s) and ${result.wires} wire(s).${kept}${inactive}`
    } finally {
      // also after a failure: the server cleared and restored, so the list is worth reloading
      emit("changed")
    }
  })
}
</script>

<template>
  <div class="flex gap-2">
    <Button variant="outline" :disabled="busy" title="Download Miniservers, signals and wires as a JSON file" @click="exportConfig">
      <Download class="size-4" /> Export
    </Button>
    <Button variant="outline" :disabled="busy" title="Replace the configuration with an exported file" @click="picker?.click()">
      <Upload class="size-4" /> Import
    </Button>
    <input ref="picker" type="file" accept=".json,application/json" class="hidden" @change="importFile" />
  </div>
</template>
