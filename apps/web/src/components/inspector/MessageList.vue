<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { BusMessageDto } from "@lox-nexus/api"
import { useVirtualizer } from "@tanstack/vue-virtual"
import { MessageText } from "../../lib/MessageText.ts"
import ValueText from "../ValueText.vue"

/**
 * Virtualized: only the rows in view exist in the DOM, so 5000 messages render as cheaply as 40.
 * Sticks to the bottom while the user hasn't scrolled up.
 */
const props = defineProps<{ messages: BusMessageDto[]; selected?: string }>()
const emit = defineEmits<{ select: [message: BusMessageDto] }>()
const ROW = 28

const scroller = ref<HTMLElement>()
const follow = ref(true)
const virtualizer = useVirtualizer(computed(() => ({
  count: props.messages.length,
  getScrollElement: () => scroller.value ?? null,
  estimateSize: () => ROW,
  overscan: 20
})))

function onScroll() {
  const element = scroller.value
  if (element) follow.value = element.scrollHeight - element.scrollTop - element.clientHeight < ROW * 2
}

watch(() => props.messages, () => {
  if (follow.value && props.messages.length > 0) virtualizer.value.scrollToIndex(props.messages.length - 1, { align: "end" })
}, { flush: "post" })

const flagStyles: Record<string, string> = {
  forced: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  shadowed: "bg-muted text-muted-foreground line-through",
  restored: "bg-sky-500/20 text-sky-600 dark:text-sky-400",
  injected: "bg-violet-500/20 text-violet-600 dark:text-violet-400"
}
</script>

<template>
  <div ref="scroller" class="h-full overflow-auto font-mono text-xs" @scroll.passive="onScroll">
    <div class="relative w-full" :style="{ height: `${virtualizer.getTotalSize()}px` }">
      <div
        v-for="row in virtualizer.getVirtualItems()" :key="String(row.key)"
        class="absolute left-0 flex w-full cursor-pointer items-center gap-3 border-b px-3 hover:bg-accent"
        :class="{ 'bg-accent': messages[row.index]?.id === selected, 'opacity-60': messages[row.index]?.flags?.shadowed }"
        :style="{ height: `${ROW}px`, transform: `translateY(${row.start}px)` }"
        @click="emit('select', messages[row.index]!)"
      >
        <template v-if="messages[row.index]">
          <span class="w-24 shrink-0 text-muted-foreground">{{ MessageText.time(messages[row.index]!.ts) }}</span>
          <span class="w-4 shrink-0 text-center">{{ MessageText.symbol(messages[row.index]!) }}</span>
          <span class="w-80 shrink-0 truncate" :title="messages[row.index]!.topic">{{ messages[row.index]!.topic }}</span>
          <span class="min-w-0 flex-1 truncate">
            <ValueText v-if="messages[row.index]!.value" :value="messages[row.index]!.value" />
            <span v-else class="text-muted-foreground">{{ MessageText.detail(messages[row.index]!) }}</span>
          </span>
          <span v-for="flag in MessageText.flags(messages[row.index]!)" :key="flag" class="rounded px-1.5" :class="flagStyles[flag]">{{ flag }}</span>
          <span class="w-48 shrink-0 truncate text-right text-muted-foreground">{{ MessageText.source(messages[row.index]!) }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
