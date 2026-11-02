<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { PluginReadmeDto } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppContext } from "../../../AppContext.ts"
import { ApiError } from "../../../api/ApiError.ts"
import { ReadmeRenderer } from "../../../lib/ReadmeRenderer.ts"
import MarkdownView from "../../MarkdownView.vue"

/** The README of an installed plugin's version in use, fetched when the dialog opens. */
const props = defineProps<{ id: string; name: string; version: string }>()
const open = defineModel<boolean>("open", { required: true })
const api = AppContext.use().pluginPackages
const renderer = new ReadmeRenderer()

const markdown = ref<string>()
const from = ref<PluginReadmeDto["from"]>("version")
// a README that isn't the installed version's own says so, since it may describe another version
const NOTES: Record<PluginReadmeDto["from"], string> = {
  version: "",
  development: "From the development copy, which runs instead of the installed version.",
  repository: "This version was installed before Nexus kept READMEs, so this is the one now in the local repository folder it came from. Update the plugin to store it with the version."
}
const state = ref<"loading" | "none" | "failed" | "ready">("loading")
const failure = ref("")
// rendered with raw HTML escaped and unsafe links dropped (ReadmeRenderer), so MarkdownView's v-html is safe
const html = computed(() => (markdown.value === undefined ? "" : renderer.render(markdown.value)))

// immediate: the instance page mounts this dialog lazily, already open
watch(open, async isOpen => {
  if (!isOpen) return
  state.value = "loading"
  try {
    const readme = await api.readme(props.id)
    ;[markdown.value, from.value] = [readme.markdown, readme.from]
    state.value = "ready"
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return void (state.value = "none")
    failure.value = error instanceof Error ? error.message : String(error)
    state.value = "failed"
  }
}, { immediate: true })
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ name }}</DialogTitle>
        <DialogDescription>README of version {{ version }}</DialogDescription>
      </DialogHeader>
      <p v-if="state === 'loading'" class="text-sm text-muted-foreground">Loading…</p>
      <p v-else-if="state === 'none'" class="text-sm text-muted-foreground">
        No README is stored for this version, and its source has none either. A plugin installed before Nexus kept READMEs gets one with its
        next update, if its source has one.
      </p>
      <Alert v-else-if="state === 'failed'" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
      <template v-else>
        <Alert v-if="NOTES[from]"><AlertDescription>{{ NOTES[from] }}</AlertDescription></Alert>
        <MarkdownView :html="html" />
      </template>
    </DialogContent>
  </Dialog>
</template>
