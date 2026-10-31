<script setup lang="ts">
import { onMounted, ref } from "vue"
import type { UserDto } from "@lox-nexus/api"
import { KeyRound, Plus, Trash2 } from "@lucide/vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import AccessTokensCard from "../components/users/AccessTokensCard.vue"
import TokenActivityCard from "../components/users/TokenActivityCard.vue"
import { AppContext } from "../AppContext.ts"
import UserDialog, { type UserDialogMode } from "../components/users/UserDialog.vue"

/**
 * Users and access, in the user menu: the accounts, each with Set password and Delete (not for
 * yourself: your own password is under Change password, and nobody deletes their own account).
 * The second tab holds your access tokens for AI agents (MCP).
 */
const api = AppContext.use().users
const users = ref<UserDto[]>([])
const failure = ref<string>()
const notice = ref<string>()
const mode = ref<UserDialogMode>()
const dialogOpen = ref(false)

async function load() {
  try {
    users.value = await api.list()
    failure.value = undefined
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
  }
}

function openDialog(next: UserDialogMode) {
  mode.value = next
  notice.value = undefined
  dialogOpen.value = true
}

async function done(message: string) {
  notice.value = message
  await load()
}

// a date, as these are days or months apart; the log-style time of day alone would hide that
const when = (at: number | undefined) => (at === undefined ? "never" : new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }))
onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-[72rem] space-y-4 p-6">
    <div>
      <h1 class="text-xl font-semibold">Users and access</h1>
      <p class="text-sm text-muted-foreground">Who can log in to Nexus. Every user can do everything; there are no roles.</p>
    </div>
    <Alert v-if="failure" variant="destructive"><AlertDescription>{{ failure }}</AlertDescription></Alert>
    <Alert v-if="notice"><AlertDescription>{{ notice }}</AlertDescription></Alert>
    <Tabs default-value="users">
      <TabsList>
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="tokens">Access tokens</TabsTrigger>
      </TabsList>
      <TabsContent value="users">
        <Card>
          <CardHeader class="flex flex-row flex-wrap items-start justify-between gap-3">
            <div class="space-y-1.5">
              <CardTitle>Users</CardTitle>
              <CardDescription>Your own password: user menu, Change password. A forgotten one: <code class="font-mono">npm run reset-password -- &lt;name&gt;</code> on the server.</CardDescription>
            </div>
            <Button size="sm" @click="openDialog({ kind: 'add' })"><Plus class="size-4" /> Add user</Button>
          </CardHeader>
          <CardContent>
            <ul class="divide-y rounded-md border text-sm">
              <li v-for="user in users" :key="user.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
                <span class="flex min-w-40 flex-1 items-center gap-2 font-medium">{{ user.username }} <Badge v-if="user.you" variant="secondary">you</Badge></span>
                <span class="text-xs text-muted-foreground">added {{ when(user.createdAt) }}</span>
                <span class="text-xs text-muted-foreground">last login {{ when(user.lastLoginAt) }}</span>
                <span class="text-xs text-muted-foreground">{{ user.tokens }} {{ user.tokens === 1 ? "token" : "tokens" }}</span>
                <span v-if="!user.you" class="flex gap-2">
                  <Button size="sm" variant="outline" @click="openDialog({ kind: 'password', user })"><KeyRound class="size-4" /> Set password</Button>
                  <Button size="sm" variant="outline" class="text-destructive" @click="openDialog({ kind: 'delete', user })"><Trash2 class="size-4" /> Delete</Button>
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="tokens" class="space-y-4">
        <AccessTokensCard @changed="load" />
        <TokenActivityCard />
      </TabsContent>
    </Tabs>
    <UserDialog v-model:open="dialogOpen" :mode="mode" @done="done" />
  </div>
</template>
