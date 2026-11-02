<script setup lang="ts">
import { computed, onMounted } from "vue"
import { ExternalLink, RefreshCw } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { AppContext } from "../../AppContext.ts"
import { ReadmeRenderer } from "../../lib/ReadmeRenderer.ts"
import { RelativeTime } from "../../lib/RelativeTime.ts"
import MarkdownView from "../MarkdownView.vue"

/**
 * Whether a newer Nexus is out and what changed since this one, from the changelog of every version
 * in between. The server asks GitHub once a day while the switch is on, or on Check now.
 */
const store = AppContext.use().appUpdate
const update = computed(() => store.state.update)
// the changelog comes from GitHub; ReadmeRenderer escapes raw HTML and drops unsafe links, so MarkdownView's v-html is safe.
// Its relative links (docs/adr/…) point into the repository at that release.
const changes = computed(() => {
  const renderer = new ReadmeRenderer(update.value?.available?.filesUrl)
  return (update.value?.changes ?? []).map(change => ({ ...change, html: renderer.render(change.markdown) }))
})
// "the newest" only stands on a check GitHub answered, and on a version Nexus could read
const newest = computed(() => update.value?.answeredAt !== undefined && !update.value.error && /^\d+\.\d+\.\d+/.test(update.value.current))
const checked = computed(() => (update.value?.checkedAt ? `Checked ${RelativeTime.ago(update.value.checkedAt, Date.now())}.` : "Not checked yet."))
const enabled = computed({ get: () => update.value?.enabled ?? false, set: value => void store.setEnabled(value) })

onMounted(() => store.load())
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row flex-wrap items-center justify-between gap-2">
      <CardTitle>Updates</CardTitle>
      <Button v-if="update && !update.disabledByServer" size="sm" variant="outline" :disabled="store.state.checking" @click="store.check()">
        <RefreshCw class="size-4" :class="store.state.checking && 'animate-spin'" /> {{ store.state.checking ? "Checking…" : "Check now" }}
      </Button>
    </CardHeader>
    <CardContent v-if="!update && store.state.loadFailure"><Alert variant="destructive"><AlertDescription>{{ store.state.loadFailure }}</AlertDescription></Alert></CardContent>
    <CardContent v-if="update" class="grid gap-3 text-sm">
      <p v-if="update.disabledByServer" class="text-muted-foreground">
        Update checks are switched off on this server (<code>NEXUS_UPDATE_CHECK=false</code>). You run Nexus {{ update.current }}.
      </p>
      <template v-else>
        <p v-if="update.available">
          <strong>Nexus {{ update.available.version }} is available.</strong> You run {{ update.current }}.
          <template v-if="update.available.publishedAt">Released {{ new Date(update.available.publishedAt).toISOString().slice(0, 10) }}.</template>
          <a :href="update.available.url" target="_blank" rel="noopener noreferrer" class="ml-1 inline-flex items-center gap-1 underline">Release on GitHub <ExternalLink class="size-3" /></a>
        </p>
        <p v-else-if="newest">Nexus {{ update.current }} is the newest version. <span class="text-muted-foreground">{{ checked }}</span></p>
        <p v-else-if="!/^\d/.test(update.current)" class="text-muted-foreground">Nexus can't tell which version it is ({{ update.current }}), so it can't compare. {{ checked }}</p>
        <p v-else class="text-muted-foreground">You run Nexus {{ update.current }}. {{ checked }}</p>
        <p v-if="update.available" class="text-muted-foreground">{{ checked }}</p>
        <Alert v-if="update.error"><AlertDescription>The last check failed: {{ update.error }}</AlertDescription></Alert>
        <div>
          <label class="flex items-center gap-2"><Switch v-model="enabled" /> Check once a day</label>
          <p class="mt-1 text-xs text-muted-foreground">Nexus asks GitHub, which sees this server's address and nothing else. Check now works either way.</p>
        </div>
      </template>
      <Alert v-if="store.state.failure" variant="destructive"><AlertDescription>{{ store.state.failure }}</AlertDescription></Alert>
      <div v-if="update.available" class="grid gap-3 border-t pt-3">
        <div class="grid gap-1">
          <h3 class="text-base font-semibold">How to update</h3>
          <ul class="list-disc pl-5 text-muted-foreground">
            <li>Docker: <code>docker compose pull &amp;&amp; docker compose up -d</code></li>
            <li>From source: <code>git pull &amp;&amp; npm install &amp;&amp; npm run build</code>, then restart Nexus</li>
          </ul>
          <p class="text-muted-foreground">Your data stays. More in <a href="docs/guide/installation.html#updating-nexus" target="_blank" rel="noopener" class="underline">Updating Nexus</a>.</p>
        </div>
        <h3 class="text-base font-semibold">What's new</h3>
        <p v-if="changes.length === 0" class="text-muted-foreground">The changelog has no entry for this release; the release on GitHub says what changed.</p>
        <div class="grid max-h-[32rem] gap-3 overflow-auto">
          <section v-for="change in changes" :key="change.version" class="grid min-w-0 gap-1">
            <h4 class="font-semibold">Nexus {{ change.version }}<span v-if="change.date" class="font-normal text-muted-foreground"> · {{ change.date }}</span></h4>
            <MarkdownView :html="change.html" />
          </section>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
