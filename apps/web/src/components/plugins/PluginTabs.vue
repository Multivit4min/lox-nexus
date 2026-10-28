<script setup lang="ts">
import { RouterLink } from "vue-router"

/** Switches between the plugin instances and the installed plugins, which share the Plugins page. */
const tabs = [
  { name: "plugins", label: "Instances" },
  { name: "plugin-packages", label: "Installed" }
] as const
</script>

<template>
  <nav class="inline-flex h-9 items-center rounded-lg bg-muted p-[3px] text-muted-foreground" aria-label="Plugins">
    <RouterLink
      v-for="tab in tabs" :key="tab.name" :to="{ name: tab.name }"
      class="rounded-md px-3 py-1 text-sm font-medium hover:text-foreground" exact-active-class="bg-background text-foreground shadow-sm"
    >
      {{ tab.label }}
    </RouterLink>
  </nav>
</template>
