<script setup lang="ts">
import { computed, ref } from "vue"
import type { CodeLanguage } from "../../lib/schema/SchemaField.ts"

/**
 * A plain code editor for config fields marked as code: monospace, no spell checking, and Tab
 * indents instead of leaving the field. Esc releases Tab for the next press, so keyboard users can
 * still move on; that first Esc is kept from the surrounding dialog (which would close and drop the
 * edit), a second one closes it as usual. Highlighting and checking are left to the plugin, which
 * reports syntax errors when it starts.
 */
const props = defineProps<{ id: string; modelValue: string; language: CodeLanguage; required?: boolean; placeholder?: string }>()
const emit = defineEmits<{ "update:modelValue": [value: string] }>()

const INDENT = "  "
const area = ref<HTMLTextAreaElement>()
const tabLeaves = ref(false)
const cursor = ref({ line: 1, column: 1 })
const rows = computed(() => Math.min(30, Math.max(12, props.modelValue.split("\n").length + 2)))
const languageName = computed(() => ({ javascript: "JavaScript", json: "JSON", text: "Text" })[props.language])

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
    <textarea
      :id="id" ref="area" :value="modelValue" :rows="rows" :required="required" :placeholder="placeholder"
      class="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs leading-5 whitespace-pre shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" :aria-describedby="`${id}-keys`"
      @input="event => emit('update:modelValue', (event.target as HTMLTextAreaElement).value)"
      @keydown="onKeydown" @keyup="updateCursor" @click="updateCursor" @focus="tabLeaves = false"
    ></textarea>
    <div class="flex justify-between text-xs text-muted-foreground">
      <span :id="`${id}-keys`">{{ languageName }} code. Tab indents; press Esc, then Tab, to leave the editor.</span>
      <span aria-live="off">Ln {{ cursor.line }}, Col {{ cursor.column }}</span>
    </div>
  </div>
</template>
