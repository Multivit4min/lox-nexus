<script setup lang="ts">
import { computed, ref } from "vue"
import type { BusMessageDto, TraceNodeDto } from "@lox-nexus/api"
import { MessageText } from "../../lib/MessageText.ts"
import ValueText from "../ValueText.vue"

/**
 * A cause chain: each message with the messages it caused, indented below it. One message can
 * fan out to many (a value wired to hundreds of targets), so each level shows LIMIT nodes until
 * the user asks for the rest.
 */
const props = defineProps<{ nodes: TraceNodeDto[]; selected?: string }>()
const emit = defineEmits<{ select: [message: BusMessageDto] }>()
const LIMIT = 50
const expanded = ref(false)
const shown = computed(() => (expanded.value ? props.nodes : props.nodes.slice(0, LIMIT)))
</script>

<template>
  <ul class="space-y-1">
    <li v-for="node in shown" :key="node.message.id">
      <button
        class="flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-xs hover:bg-accent"
        :class="{ 'bg-accent': node.message.id === selected }"
        @click="emit('select', node.message)"
      >
        <span>{{ MessageText.symbol(node.message) }}</span>
        <span class="truncate">{{ node.message.topic }}</span>
        <ValueText v-if="node.message.value" :value="node.message.value" />
        <span class="ml-auto shrink-0 text-muted-foreground">{{ MessageText.source(node.message) }}</span>
      </button>
      <div v-if="node.children.length" class="ml-4 border-l pl-2">
        <TraceTree :nodes="node.children" :selected="selected" @select="message => emit('select', message)" />
      </div>
    </li>
    <li v-if="nodes.length > shown.length">
      <button class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground" @click="expanded = true">+ {{ nodes.length - shown.length }} more</button>
    </li>
  </ul>
</template>
