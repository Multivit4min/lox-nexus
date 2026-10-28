<script setup lang="ts">
import { ShieldAlert } from "@lucide/vue"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/** Shown before anything is fetched: checking a plugin already runs its code once. */
</script>

<template>
  <Alert class="border-amber-500/60 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
    <ShieldAlert class="size-4" />
    <AlertTitle>Plugins are trusted code</AlertTitle>
    <AlertDescription class="text-current/90">
      A plugin runs inside Nexus with the same access to files and the network as Nexus itself;
      worker threads are not a sandbox. Checking a plugin already runs its code once. Only install
      plugins whose source you trust.
    </AlertDescription>
  </Alert>
</template>
