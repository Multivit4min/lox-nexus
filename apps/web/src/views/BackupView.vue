<script setup lang="ts">
import BackupCreateCard from "../components/backup/BackupCreateCard.vue"
import BackupRestoreCard from "../components/backup/BackupRestoreCard.vue"
</script>

<template>
  <div class="mx-auto max-w-[64rem] space-y-4 p-6">
    <div>
      <h1 class="text-xl font-semibold">Backup</h1>
      <p class="text-sm text-muted-foreground">The whole installation in one encrypted file, and back.</p>
    </div>
    <BackupCreateCard />
    <BackupRestoreCard />
  </div>
</template>
