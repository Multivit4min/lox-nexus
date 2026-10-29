<script setup lang="ts">
import { computed, ref } from "vue"
import { CodeHighlighter, type TokenKind } from "../../lib/schema/CodeHighlighter.ts"
import type { CodeLanguage } from "../../lib/schema/SchemaField.ts"

/**
 * A code editor for config fields marked as code: monospace, basic syntax highlighting, no spell
 * checking, and Tab indents instead of leaving the field. Esc releases Tab for the next press, so
 * keyboard users can still move on; that first Esc is kept from the surrounding dialog (which would
 * close and drop the edit), a second one closes it as usual. The highlighting is a copy of the text
 * drawn under a textarea with transparent text, so editing, undo and the caret stay the browser's.
 * Checking is left to the plugin, which reports syntax errors when it starts.
 */
const props = defineProps<{ id: string; modelValue: string; language: CodeLanguage; required?: boolean; placeholder?: string }>()
const emit = defineEmits<{ "update:modelValue": [value: string] }>()

const INDENT = "  "
const COLORS: Record<TokenKind, string> = {
  plain: "",
  comment: "text-muted-foreground italic",
  string: "text-emerald-700 dark:text-emerald-400",
  number: "text-amber-700 dark:text-amber-400",
  keyword: "text-violet-700 dark:text-violet-400",
  literal: "text-sky-700 dark:text-sky-400",
  property: "text-sky-700 dark:text-sky-400"
}
const highlighter = new CodeHighlighter()
const area = ref<HTMLTextAreaElement>()
const backdrop = ref<HTMLElement>()
const tokens = computed(() => highlighter.tokens(props.modelValue, props.language))
const tabLeaves = ref(false)
const cursor = ref({ line: 1, column: 1 })
const rows = computed(() => Math.min(30, Math.max(12, props.modelValue.split("\n").length + 2)))
const languageName = computed(() => ({ javascript: "JavaScript", json: "JSON", text: "Text" })[props.language])

// the backdrop can't scroll on its own; it follows the textarea
function syncScroll() {
  if (!area.value || !backdrop.value) return
  backdrop.value.scrollTop = area.value.scrollTop
  backdrop.value.scrollLeft = area.value.scrollLeft
}

function updateCursor() {
  const element = area.value
  if (!element) return
  const before = element.value.slice(0, element.selectionStart).split("\n")
  cursor.value = { line: before.length, column: before.at(-1)!.length + 1 }
}

// edits through execCommand keep the browser's undo history; the fallback loses it but still works
function insert(text: string) {
  const element = area.value!
  if (!document.execCommand?.("insertText", false, text)) {
    const { selectionStart: start, selectionEnd: end } = element
    element.setRangeText(text, start, end, "end")
    emit("update:modelValue", element.value)
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    if (tabLeaves.value) return
    tabLeaves.value = true
    // reka's dialogs close on any Escape that isn't prevented
    event.preventDefault()
    event.stopPropagation()
    return
  }
  if (event.key !== "Tab") {
    // typing after Esc means the user stayed: Tab indents again
    if (event.key !== "Shift") tabLeaves.value = false
    return
  }
  if (tabLeaves.value || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  event.preventDefault()
  insert(INDENT)
}
</script>

<template>
  <div class="grid gap-1">
    <div class="relative">
      <!-- same box, font and padding as the textarea, so every character sits under its own; the
           trailing space keeps a last empty line as tall as in the textarea -->
      <pre
        ref="backdrop" aria-hidden="true"
        class="pointer-events-none absolute inset-0 m-0 overflow-hidden rounded-md border border-transparent px-3 py-2 font-mono text-xs leading-5 whitespace-pre"
      ><span v-for="(token, index) in tokens" :key="index" :class="COLORS[token.kind]">{{ token.text }}</span> </pre>
      <textarea
        :id="id" ref="area" :value="modelValue" :rows="rows" :required="required" :placeholder="placeholder"
        class="relative block w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs leading-5 whitespace-pre text-transparent caret-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" :aria-describedby="`${id}-keys`"
        @input="event => emit('update:modelValue', (event.target as HTMLTextAreaElement).value)"
        @keydown="onKeydown" @keyup="updateCursor" @click="updateCursor" @focus="tabLeaves = false" @scroll="syncScroll"
      ></textarea>
    </div>
    <div class="flex justify-between text-xs text-muted-foreground">
      <span :id="`${id}-keys`">{{ languageName }} code. Tab indents; press Esc, then Tab, to leave the editor.</span>
      <span aria-live="off">Ln {{ cursor.line }}, Col {{ cursor.column }}</span>
    </div>
  </div>
</template>
