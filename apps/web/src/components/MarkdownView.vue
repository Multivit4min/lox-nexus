<script setup lang="ts">
/**
 * Markdown already turned into safe HTML by ReadmeRenderer (raw HTML escaped, unsafe links dropped),
 * with the typography the UI uses for plugin READMEs and the changelog.
 */
defineProps<{ html: string }>()
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="readme min-w-0" v-html="html"></div>
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
/* natural column widths, scrolling sideways when wider than their box */
.readme :deep(table) { border-collapse: collapse; display: block; overflow-x: auto; width: max-content; max-width: 100%; }
/* cells wrap between words only: breaking anywhere would squeeze a column to a letter */
.readme :deep(th), .readme :deep(td) { border: 1px solid var(--border); padding: 0.25rem 0.5rem; text-align: left; vertical-align: top; overflow-wrap: normal; }
.readme :deep(td code) { white-space: nowrap; }
.readme :deep(th) { background: var(--muted); font-weight: 600; }
.readme :deep(blockquote) { border-left: 3px solid var(--border); padding-left: 0.75rem; color: var(--muted-foreground); }
</style>
