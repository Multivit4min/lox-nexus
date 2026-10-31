<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { AccessScope, CreatedAccessTokenDto } from "@lox-nexus/api"
import { Copy } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AppContext } from "../../AppContext.ts"
import { ApiError } from "../../api/ApiError.ts"

/**
 * Creates an access token for an agent: a name, what it may do beyond reading, and your password.
 * The token is shown once, with the line that adds Nexus to Claude Code; closing forgets it.
 */
const emit = defineEmits<{ created: [] }>()
const open = defineModel<boolean>("open", { required: true })
const api = AppContext.use().tokens

const name = ref("")
const configure = ref(false)
const operate = ref(false)
const own = ref("")
const error = ref("")
const busy = ref(false)
const created = ref<CreatedAccessTokenDto>()

watch(open, isOpen => {
  if (isOpen) [name.value, configure.value, operate.value, own.value, error.value, created.value, copied.value] = ["", false, false, "", "", undefined, ""]
  else created.value = undefined
})

// relative to the page, so it is right behind a proxy that serves Nexus under a path
const endpoint = computed(() => new URL("mcp", document.baseURI).href)
const command = computed(() => created.value && `claude mcp add --transport http nexus ${endpoint.value} --header "Authorization: Bearer ${created.value.token}"`)

async function onSubmit() {
  busy.value = true
  error.value = ""
  try {
    const scopes: AccessScope[] = [...(configure.value ? ["configure" as const] : []), ...(operate.value ? ["operate" as const] : [])]
    created.value = await api.create({ currentPassword: own.value, name: name.value.trim(), scopes })
    emit("created")
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : String(failure)
  } finally {
    own.value = ""
    busy.value = false
  }
}

const selectAll = (event: FocusEvent) => (event.target instanceof HTMLInputElement ? event.target.select() : undefined)

// browsers only offer the clipboard on https or localhost; on http://192.168… the text is selected for copying by hand
const copied = ref("")
async function copy(text: string | undefined, what: string) {
  if (!text) return
  try {
    if (!navigator.clipboard) throw new Error("no clipboard")
    await navigator.clipboard.writeText(text)
    copied.value = `${what} copied.`
  } catch {
    copied.value = "Copying needs https: select the text and copy it by hand."
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ created ? "Your new access token" : "Create an access token" }}</DialogTitle>
        <DialogDescription v-if="created">Copy it now: it is not shown again. Anyone with it can do what you allowed, until you revoke it.</DialogDescription>
        <DialogDescription v-else>For an AI agent (Claude Code, Gemini CLI, …) that works with Nexus over MCP. It acts as you.</DialogDescription>
      </DialogHeader>
      <div v-if="created" class="grid gap-3">
        <div class="flex gap-2">
          <Input :model-value="created.token" readonly class="font-mono text-xs" aria-label="Access token" @focus="selectAll" />
          <Button variant="outline" size="icon" title="Copy the token" @click="copy(created.token, 'The token is')"><Copy class="size-4" /></Button>
        </div>
        <Label>Add it to Claude Code</Label>
        <div class="flex gap-2">
          <code class="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all">{{ command }}</code>
          <Button variant="outline" size="icon" title="Copy the command" @click="copy(command, 'The command is')"><Copy class="size-4" /></Button>
        </div>
        <p v-if="copied" class="text-xs text-muted-foreground" role="status">{{ copied }}</p>
        <Button @click="open = false">Done</Button>
      </div>
      <form v-else class="grid gap-4" @submit.prevent="onSubmit">
        <div class="grid gap-2">
          <Label for="tokenName">Name</Label>
          <Input id="tokenName" v-model="name" placeholder="Claude Code on my laptop" required maxlength="64" />
        </div>
        <fieldset class="grid gap-2 text-sm">
          <legend class="mb-1 font-medium">It may</legend>
          <label class="flex items-start gap-2 text-muted-foreground"><Checkbox :model-value="true" disabled /> read everything (signals, values, wires), which can show who is home</label>
          <label class="flex items-start gap-2"><Checkbox v-model="configure" /> set up Miniservers, signals and wires</label>
          <label class="flex items-start gap-2"><Checkbox v-model="operate" /> <span>operate devices: force values, run plugin actions, set up plugin instances (they run code) <span class="text-amber-600 dark:text-amber-400">(acts on your house)</span></span></label>
        </fieldset>
        <div class="grid gap-2 border-t pt-4">
          <Label for="tokenOwn">Your password</Label>
          <Input id="tokenOwn" v-model="own" type="password" autocomplete="current-password" required />
        </div>
        <Alert v-if="error" variant="destructive"><AlertDescription>{{ error }}</AlertDescription></Alert>
        <Button type="submit" :disabled="busy">{{ busy ? "Creating…" : "Create token" }}</Button>
      </form>
    </DialogContent>
  </Dialog>
</template>
