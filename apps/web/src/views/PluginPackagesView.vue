<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import type { InstalledPluginDto, RepositoryPluginDto } from "@lox-nexus/api"
import { PackagePlus, SearchCheck } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AppContext } from "../AppContext.ts"
import BatchUpdateDialog from "../components/plugins/install/BatchUpdateDialog.vue"
import InstallDialog from "../components/plugins/install/InstallDialog.vue"
import InstalledPluginCard from "../components/plugins/install/InstalledPluginCard.vue"
import RollbackDialog from "../components/plugins/install/RollbackDialog.vue"
import UpdatesBanner from "../components/plugins/install/UpdatesBanner.vue"
import PluginIcon from "../components/plugins/PluginIcon.vue"
import PluginTabs from "../components/plugins/PluginTabs.vue"
import { InstallSources, type InstallSource } from "../lib/InstallSource.ts"
import { VersionChange } from "@lox-nexus/api"

/** The installed plugins, with install, update, rollback and uninstall; and what the local plugin repository offers. */
const { pluginPackages: api, updates } = AppContext.use()
const installed = ref<InstalledPluginDto[]>([])
const repository = ref<RepositoryPluginDto[]>([])
const installing = ref(false)
const installFrom = ref<InstallSource>()
const rollingBack = ref<InstalledPluginDto>()
const error = ref("")
const batch = ref<string[]>([])
const batchOpen = ref(false)
const checking = ref(false)

// plugins in the repository that aren't installed, or in another version than the active one
const offered = computed(() => repository.value.filter(plugin =>
  !plugin.problem && plugin.version && VersionChange.of(plugin.version, plugin.installedVersion) !== "same"))

// one place for reloading, so failures show on the page and a success clears them
async function refresh() {
  try {
    ;[installed.value, repository.value] = await Promise.all([api.list(), api.repository(), updates.load()])
    error.value = ""
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  }
}

// from the local repository: one review and one click, also for a single plugin
function updateAll(ids: string[]) {
  batch.value = ids
  batchOpen.value = true
}

// a plugin from the local repository with an update goes the short way; git and ZIP installs ask for their source again
function update(plugin: InstalledPluginDto) {
  if (updates.of(plugin.id)?.source === "local") updateAll([plugin.id])
  else install(InstallSources.updateOf(plugin))
}

async function checkGit() {
  checking.value = true
  try {
    await updates.check()
    error.value = ""
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  } finally {
    checking.value = false
  }
}

// the repository is read again, so plugins built since the page opened are offered
function install(from?: InstallSource) {
  installFrom.value = from
  installing.value = true
  void refresh()
}

// after the rollback dialog closes, whether or not it switched: the card shows what is active now
function rollbackClosed(open: boolean) {
  if (open) return
  rollingBack.value = undefined
  void refresh()
}

async function uninstall(plugin: InstalledPluginDto) {
  if (!confirm(`Uninstall ${plugin.name}? Its files are removed; you can install it again later.`)) return
  error.value = ""
  try {
    await api.uninstall(plugin.id)
  } catch (failure) {
    await refresh()
    error.value = failure instanceof Error ? failure.message : String(failure)
    return
  }
  await refresh()
}

onMounted(refresh)
</script>

<template>
  <div class="mx-auto max-w-[96rem] space-y-4 p-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-4">
        <h1 class="text-xl font-semibold">Plugins</h1>
        <PluginTabs />
      </div>
      <div class="flex flex-wrap gap-2">
        <Button
          v-if="installed.some(plugin => plugin.active.source.kind === 'git')" variant="outline" :disabled="checking"
          :title="updates.state.value.gitCheckedAt ? `Last checked ${new Date(updates.state.value.gitCheckedAt).toLocaleString()}` : 'Asks each git repository for new commits'"
          @click="checkGit"
        >
          <SearchCheck class="size-4" /> {{ checking ? "Checking…" : "Check for updates" }}
        </Button>
        <Button @click="install()"><PackagePlus class="size-4" /> Install plugin</Button>
      </div>
    </div>
    <Alert v-if="error" variant="destructive"><AlertDescription>{{ error }}</AlertDescription></Alert>
    <UpdatesBanner @update-all="updateAll" />
    <Alert v-for="problem in updates.state.value.problems" :key="problem.id"><AlertDescription>{{ problem.name }}: couldn't check for updates ({{ problem.problem }})</AlertDescription></Alert>
    <div v-if="installed.length" class="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      <InstalledPluginCard
        v-for="plugin in installed" :key="plugin.id" :plugin="plugin"
        @update="update(plugin)" @rollback="rollingBack = plugin" @uninstall="uninstall(plugin)"
      />
    </div>
    <p v-else class="text-sm text-muted-foreground">No plugin is installed yet. Install one from the local repository, a git repository or a ZIP file.</p>
    <section v-if="offered.length" class="space-y-2">
      <h2 class="text-sm font-medium">In the local plugin repository</h2>
      <ul class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <li v-for="plugin in offered" :key="plugin.folder" class="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
          <span class="flex flex-wrap items-center gap-1">
            <PluginIcon :name="plugin.icon" class="size-4 text-muted-foreground" />
            {{ plugin.name }} <span class="font-mono">{{ plugin.version }}</span>
            <span v-if="plugin.installedVersion" class="text-muted-foreground"> (installed: {{ plugin.installedVersion }})</span>
          </span>
          <Button
            size="sm" variant="outline"
            @click="plugin.installedVersion && plugin.id && updates.of(plugin.id)?.source === 'local' ? updateAll([plugin.id]) : install({ kind: 'local', folder: plugin.folder, update: plugin.installedVersion !== undefined })"
          >
            {{ plugin.installedVersion ? "Update" : "Install" }}
          </Button>
        </li>
      </ul>
    </section>
    <InstallDialog v-model:open="installing" :initial="installFrom" :repository="repository" @changed="refresh" @rollback="plugin => (rollingBack = plugin)" />
    <BatchUpdateDialog v-if="batch.length" v-model:open="batchOpen" :ids="batch" @changed="refresh" />
    <RollbackDialog v-if="rollingBack" :open="rollingBack !== undefined" :plugin="rollingBack" @update:open="rollbackClosed" @changed="refresh" />
  </div>
</template>
