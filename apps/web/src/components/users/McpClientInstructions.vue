<script setup lang="ts">
import { computed } from "vue"
import { Copy } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { McpClientSetup } from "../../lib/McpClientSetup.ts"

/** How to add a new access token to Claude Code or Claude Desktop, with the text to copy. */
const props = defineProps<{ endpoint: string; token: string }>()
const emit = defineEmits<{ copy: [text: string, what: string] }>()

const setup = computed(() => new McpClientSetup(props.endpoint, props.token))
// the template sets min-w-0 and minmax(0, 1fr) at every level: without them the config's long lines widen the whole dialog
</script>

<template>
  <Tabs default-value="code" class="min-w-0">
    <TabsList>
      <TabsTrigger value="code">Claude Code</TabsTrigger>
      <TabsTrigger value="desktop">Claude Desktop</TabsTrigger>
    </TabsList>
    <TabsContent value="code" class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 text-sm">
      <p class="text-muted-foreground">Run it in a terminal: PowerShell or Command Prompt on Windows, a shell on macOS and Linux.</p>
      <div class="flex min-w-0 gap-2">
        <code class="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all">{{ setup.claudeCode() }}</code>
        <Button variant="outline" size="icon" title="Copy the command" @click="emit('copy', setup.claudeCode(), 'The command is')"><Copy class="size-4" /></Button>
      </div>
    </TabsContent>
    <TabsContent value="desktop" class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 text-sm">
      <ol class="grid list-decimal gap-1 pl-5 text-muted-foreground">
        <li>Install <a href="https://nodejs.org/" target="_blank" rel="noopener noreferrer" class="underline">Node.js</a> (LTS) if you haven't: Claude Desktop starts the bridge to Nexus with <code>npx</code>.</li>
        <li>In Claude Desktop open <strong>Settings ▸ Developer ▸ Edit Config</strong>. It shows <code>claude_desktop_config.json</code>, on Windows in <code>%APPDATA%\Claude</code>.</li>
        <li>Open the file in a text editor and put this in. If it already has <code>"mcpServers"</code>, add only the <code>"nexus"</code> entry to it.</li>
      </ol>
      <div class="flex min-w-0 gap-2">
        <pre class="max-h-48 min-w-0 flex-1 overflow-auto rounded-md bg-muted px-2 py-1.5 font-mono text-xs">{{ setup.claudeDesktop() }}</pre>
        <Button variant="outline" size="icon" title="Copy the configuration" @click="emit('copy', setup.claudeDesktop(), 'The configuration is')"><Copy class="size-4" /></Button>
      </div>
      <p class="text-muted-foreground">
        Then quit Claude Desktop completely (on Windows also from the icon next to the clock) and start it again.
        <template v-if="setup.plainHttp"><code>--allow-http</code> is there because Nexus is reached over plain http, so the token crosses your network unencrypted.</template>
      </p>
    </TabsContent>
  </Tabs>
</template>
