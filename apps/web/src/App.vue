<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { TooltipProvider } from "@/components/ui/tooltip"
import AppShell from "./components/AppShell.vue"

const route = useRoute()
// login and setup are full-screen; everything else lives in the shell with navigation
const bare = computed(() => route.meta.public === true)
</script>

<template>
  <TooltipProvider>
    <RouterView v-if="bare" />
    <AppShell v-else>
      <!-- keyed by path: views load their data once, so /plugins/a → /plugins/b (back, forward, a link) needs a fresh view -->
      <RouterView :key="route.path" />
    </AppShell>
  </TooltipProvider>
</template>
