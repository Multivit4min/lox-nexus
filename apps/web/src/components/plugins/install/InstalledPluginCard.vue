<script setup lang="ts">
import { computed, ref } from "vue"
import type { InstalledPluginDto } from "@lox-nexus/api"
import { Check, Copy, RefreshCw, Trash2, Undo2 } from "@lucide/vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PluginSourceText } from "../../../lib/PluginSourceText.ts"

/** One installed plugin: its active version and where it came from, with update, rollback and uninstall. */
const props = defineProps<{ plugin: InstalledPluginDto }>()
const emit = defineEmits<{ update: []; rollback: []; uninstall: [] }>()

const active = computed(() => props.plugin.active)
const when = computed(() => new Date(active.value.installedAt).toLocaleString())
const inUse = computed(() => props.plugin.instances
  ? `Used by ${props.plugin.instances} instance${props.plugin.instances === 1 ? "" : "s"}; delete them on the Instances tab to uninstall.`
  : "")
// the clipboard API exists only in secure contexts (https, localhost); elsewhere the button is hidden
const canCopy = typeof window !== "undefined" && window.isSecureContext && navigator.clipboard !== undefined
const copied = ref(false)
async function copy() {
  try {
    await navigator.clipboard.writeText(PluginSourceText.fingerprint(active.value.source))
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // denied by the browser: nothing to confirm
  }
}
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row flex-wrap items-baseline justify-between gap-2">
      <CardTitle class="flex flex-wrap items-baseline gap-2">
        {{ plugin.name }} <span class="font-mono text-sm font-normal">{{ active.version }}</span>
        <Badge v-if="plugin.shadowedByDevelopment" variant="secondary" title="NEXUS_DEV_PLUGINS_DIR provides a copy with the same id">development copy runs instead</Badge>
        <Badge v-if="!active.available" variant="destructive" :title="active.problem">unavailable</Badge>
      </CardTitle>
      <span class="text-sm text-muted-foreground">{{ plugin.instances }} instance{{ plugin.instances === 1 ? "" : "s" }}</span>
    </CardHeader>
    <CardContent class="grid gap-3 text-sm">
      <p v-if="active.problem" class="text-destructive">{{ active.problem }}</p>
      <p class="flex min-w-0 items-center gap-1">
        <span class="truncate" :title="PluginSourceText.fingerprint(active.source)">{{ PluginSourceText.short(active.source) }}</span>
        <Button
          v-if="canCopy && active.source.kind !== 'local'" size="icon" variant="ghost" class="size-6 shrink-0"
          :aria-label="active.source.kind === 'git' ? 'Copy the full commit' : 'Copy the archive sha256'" @click="copy"
        >
          <Check v-if="copied" class="size-3.5 text-emerald-600" /><Copy v-else class="size-3.5" />
        </Button>
        <span class="sr-only" aria-live="polite">{{ copied ? "Copied" : "" }}</span>
      </p>
      <p class="text-xs text-muted-foreground">installed {{ when }} by {{ active.installedBy }} · id <code>{{ plugin.id }}</code></p>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" @click="emit('update')"><RefreshCw class="size-4" /> Update</Button>
        <Button v-if="plugin.previous" size="sm" variant="outline" :disabled="!plugin.previous.available" :title="plugin.previous.problem" @click="emit('rollback')">
          <Undo2 class="size-4" /> Roll back to {{ plugin.previous.version }}
        </Button>
        <Button size="sm" variant="ghost" class="text-destructive" :disabled="plugin.instances > 0" :aria-describedby="inUse ? `in-use-${plugin.id}` : undefined" @click="emit('uninstall')">
          <Trash2 class="size-4" /> Uninstall
        </Button>
      </div>
      <p v-if="inUse" :id="`in-use-${plugin.id}`" class="text-xs text-muted-foreground">{{ inUse }}</p>
    </CardContent>
  </Card>
</template>
