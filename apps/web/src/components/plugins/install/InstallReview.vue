<script setup lang="ts">
import { computed } from "vue"
import type { StagedInstallDto } from "@lox-nexus/api"
import { Badge } from "@/components/ui/badge"
import { PluginSourceText } from "../../../lib/PluginSourceText.ts"
import { VersionChange } from "../../../lib/VersionChange.ts"
import UpdateImpactList from "./UpdateImpactList.vue"

/** Step 2 of an install: what was fetched (name, version change, exact source, hashes) and what confirming does. */
const props = defineProps<{ staged: StagedInstallDto }>()

const change = computed(() => VersionChange.of(props.staged.version, props.staged.installedVersion))
const changeText = computed(() => ({
  new: "new plugin",
  same: props.staged.sameAsInstalled ? "already installed" : "stored version, activated again",
  rebuild: `another build of ${props.staged.installedVersion}`,
  update: `update from ${props.staged.installedVersion}`,
  older: `older than the active ${props.staged.installedVersion}`
})[change.value])
const source = computed(() => props.staged.source)
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`
</script>

<template>
  <div class="grid gap-4 text-sm">
    <div class="flex flex-wrap items-baseline gap-2">
      <span class="text-base font-semibold">{{ staged.name }}</span>
      <span class="font-mono">{{ staged.version }}</span>
      <Badge :variant="change === 'older' ? 'destructive' : 'secondary'">{{ changeText }}</Badge>
      <span class="text-muted-foreground">id <code>{{ staged.id }}</code> · {{ plural(staged.sensors, "sensor") }} · {{ plural(staged.actuators, "actuator") }}</span>
    </div>
    <dl class="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
      <template v-if="source.kind === 'git'">
        <dt class="text-muted-foreground">Repository</dt><dd class="break-all">{{ source.url }}</dd>
        <dt class="text-muted-foreground">Branch or tag</dt><dd>{{ source.ref }}</dd>
        <dt class="text-muted-foreground">Commit</dt><dd class="font-mono text-xs break-all">{{ source.commit }}</dd>
      </template>
      <template v-else-if="source.kind === 'zip'">
        <dt class="text-muted-foreground">Archive</dt><dd class="break-all">{{ source.fileName }}</dd>
        <dt class="text-muted-foreground">Archive sha256</dt><dd class="font-mono text-xs break-all">{{ PluginSourceText.fingerprint(source) }}</dd>
      </template>
      <template v-else>
        <dt class="text-muted-foreground">Folder</dt><dd class="break-all">{{ source.folder }}</dd>
      </template>
      <dt class="text-muted-foreground">Bundle sha256</dt><dd class="font-mono text-xs break-all">{{ staged.bundleSha256 }}</dd>
    </dl>
    <p v-if="staged.sameAsInstalled" class="text-muted-foreground">
      This exact version is installed already. Installing it again changes nothing, or repairs its files if they went missing.
    </p>
    <UpdateImpactList v-else-if="staged.impact" :impact="staged.impact" />
  </div>
</template>
