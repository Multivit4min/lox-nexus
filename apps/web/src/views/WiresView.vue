<script setup lang="ts">
import WiresCard from "../components/wires/WiresCard.vue"
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-4 p-6">
    <div>
      <h1 class="text-xl font-semibold">Wires</h1>
      <p class="text-sm text-muted-foreground">A wire carries every value of a source to a target, transformed on the way and converted to the target's type. Each target takes one wire.</p>
    </div>
    <WiresCard title="All wires" />
  </div>
</template>
