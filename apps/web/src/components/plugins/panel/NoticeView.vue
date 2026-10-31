<script setup lang="ts">
import { computed } from "vue"
import type { PanelPart } from "@lox-nexus/plugin-sdk/wire"
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "@lucide/vue"
import { ToneStyle } from "../../../lib/ToneStyle.ts"

/** A message from the plugin for the user, e.g. "Not paired yet", with an optional link. */
const props = defineProps<{ notice: Extract<PanelPart, { type: "notice" }> }>()
const icon = computed(() => ({ ok: CircleCheck, warn: TriangleAlert, error: CircleAlert, info: Info, muted: Info })[props.notice.tone])
// the host checks links too; this keeps a javascript: link out even if one slipped through
const link = computed(() => {
  const href = props.notice.link?.href
  if (!href) return undefined
  if (href.startsWith("#/")) return { href, external: false }
  return /^https?:\/\//i.test(href) ? { href, external: true } : undefined
})
</script>

<template>
  <div :class="['flex gap-3 rounded-lg border p-3 text-sm', ToneStyle.box(notice.tone)]" :role="notice.tone === 'error' || notice.tone === 'warn' ? 'alert' : 'status'">
    <component :is="icon" :class="['mt-0.5 size-4 shrink-0', ToneStyle.text(notice.tone)]" />
    <div class="grid gap-1">
      <p v-if="notice.title" class="font-medium">{{ notice.title }}</p>
      <p class="whitespace-pre-wrap text-muted-foreground">{{ notice.text }}</p>
      <a v-if="link" :href="link.href" class="w-fit underline underline-offset-2" v-bind="link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}">
        {{ notice.link?.label }}
      </a>
    </div>
  </div>
</template>
