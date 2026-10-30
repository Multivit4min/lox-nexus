<script setup lang="ts">
import { ref } from "vue"
import { Download, Upload } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { AppContext } from "../AppContext.ts"
import { ApiError } from "../api/ApiError.ts"
import { JsonFile } from "../lib/JsonFile.ts"
import ConfigExportDialog from "./ConfigExportDialog.vue"
import ConfigPassphraseDialog from "./ConfigPassphraseDialog.vue"

/**
 * Export the whole configuration (Miniservers, signals, wires, plugin instances) as a JSON file,
 * the plugins' secrets optionally sealed with a passphrase, or replace it with one. Miniserver
 * passwords are not part of the file. The outcome is reported through `result`.
 */
const emit = defineEmits<{ result: [outcome: { ok: boolean; text: string }]; changed: [] }>()
const { config } = AppContext.use()
const picker = ref<HTMLInputElement>()
const busy = ref(false)
const exporting = ref(false)
// a file with sealed secrets waits here for its passphrase
const pending = ref<{ name: string; doc: unknown }>()
const asking = ref(false)

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

function exportConfig(passphrase: string | undefined) {
  return run(async () => {
    const doc = passphrase === undefined ? await config.export() : await config.exportSealed(passphrase)
    JsonFile.save(`lox-nexus-config-${doc.exportedAt?.slice(0, 10) ?? "export"}.json`, doc)
    const secrets = doc.secrets ? "The plugins' secret settings are included, encrypted." : "The plugins' secret settings are not included."
    return `Exported ${doc.miniservers.length} Miniserver(s), ${doc.plugins?.length ?? 0} plugin instance(s) and ${doc.wires.length} wire(s). ${secrets} Miniserver passwords are never included.`
  })
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // cleared so that choosing the same file again fires another change event
  input.value = ""
  if (!file) return
  const doc: unknown = await JsonFile.read(file).catch((error: unknown) => emit("result", { ok: false, text: String(error instanceof Error ? error.message : error) }))
  if (doc === undefined) return
  const withPlugins = typeof doc === "object" && doc !== null && "plugins" in doc ? " and plugin instances (with their sensors and actuators)" : ""
  const question = `Replace the whole configuration with ${file.name}?\n\nAll Miniservers, signals, wires${withPlugins} are replaced; forces and last values on them are dropped. If anything fails, the current configuration is restored (without its forces and values).`
  if (!confirm(question)) return
  if (typeof doc === "object" && doc !== null && "secrets" in doc) {
    pending.value = { name: file.name, doc }
    asking.value = true
    return
  }
  await importDoc(doc)
}

async function importDoc(doc: unknown, passphrase?: string) {
  await run(async () => {
    try {
      const result = await config.import(doc, passphrase)
      const kept = result.keptPasswords.length ? ` ${result.keptPasswords.length} kept their stored password.` : ""
      const inactive = result.inactiveWires ? ` ${result.inactiveWires} wire(s) can't run and are listed as inactive.` : ""
      const missing = result.missingSecrets.length ? ` Enter the secret settings of ${result.missingSecrets.map(entry => `${entry.label} (${entry.fields.join(", ")})`).join(", ")} in their settings.` : ""
      pending.value = undefined
      return `Imported ${result.miniservers} Miniserver(s), ${result.signals} signal(s), ${result.plugins} plugin instance(s) with ${result.pluginSignals} sensor(s) and actuator(s), and ${result.wires} wire(s).${kept}${inactive}${missing}`
    } catch (error) {
      // the file stays picked: only the passphrase was wrong
      if (passphrase !== undefined && error instanceof ApiError && /passphrase/.test(error.message)) asking.value = true
      throw error
    } finally {
      // also after a failure: the server cleared and restored, so the list is worth reloading
      emit("changed")
    }
  })
}
</script>

<template>
  <div class="flex gap-2">
    <Button variant="outline" :disabled="busy" title="Download Miniservers, signals, wires and plugin instances as a JSON file" @click="exporting = true">
      <Download class="size-4" /> Export
    </Button>
    <Button variant="outline" :disabled="busy" title="Replace the configuration with an exported file" @click="picker?.click()">
      <Upload class="size-4" /> Import
    </Button>
    <input ref="picker" type="file" accept=".json,application/json" class="hidden" @change="importFile" />
    <ConfigExportDialog v-model:open="exporting" @export="exportConfig" />
    <ConfigPassphraseDialog v-if="pending" v-model:open="asking" :file-name="pending.name" @passphrase="passphrase => importDoc(pending!.doc, passphrase)" />
  </div>
</template>
