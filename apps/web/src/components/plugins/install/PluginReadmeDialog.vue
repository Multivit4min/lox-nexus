<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { PluginReadmeDto } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppContext } from "../../../AppContext.ts"
import { ApiError } from "../../../api/ApiError.ts"
import { ReadmeRenderer } from "../../../lib/ReadmeRenderer.ts"

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
// rendered with raw HTML escaped and unsafe links dropped (ReadmeRenderer), so v-html is safe here
const html = computed(() => (markdown.value === undefined ? "" : renderer.render(markdown.value)))

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
})
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
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="readme min-w-0" v-html="html"></div>
      </template>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.readme { font-size: 0.875rem; line-height: 1.6; overflow-wrap: anywhere; }
.readme :deep(h1) { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.75rem; }
.readme :deep(h2) { font-size: 1.05rem; font-weight: 600; margin: 1.5rem 0 0.5rem; padding-bottom: 0.25rem; border-bottom: 1px solid var(--border); }
.readme :deep(h3) { font-size: 0.95rem; font-weight: 600; margin: 1.25rem 0 0.5rem; }
.readme :deep(p), .readme :deep(ul), .readme :deep(ol), .readme :deep(pre), .readme :deep(table) { margin: 0 0 0.75rem; }
.readme :deep(ul) { list-style: disc; padding-left: 1.25rem; }
.readme :deep(ol) { list-style: decimal; padding-left: 1.25rem; }
.readme :deep(a) { color: var(--viz-series); text-decoration: underline; }
.readme :deep(code) { font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8em; background: var(--muted); padding: 0.1em 0.3em; border-radius: 0.25rem; }
.readme :deep(pre) { background: var(--muted); padding: 0.75rem; border-radius: 0.375rem; overflow-x: auto; }
.readme :deep(pre code) { background: none; padding: 0; }
/* natural column widths, scrolling sideways when wider than the dialog */
.readme :deep(table) { border-collapse: collapse; display: block; overflow-x: auto; width: max-content; max-width: 100%; }
/* cells wrap between words only: breaking anywhere would squeeze a column to a letter */
.readme :deep(th), .readme :deep(td) { border: 1px solid var(--border); padding: 0.25rem 0.5rem; text-align: left; vertical-align: top; overflow-wrap: normal; }
.readme :deep(td code) { white-space: nowrap; }
.readme :deep(th) { background: var(--muted); font-weight: 600; }
.readme :deep(blockquote) { border-left: 3px solid var(--border); padding-left: 0.75rem; color: var(--muted-foreground); }
</style>
