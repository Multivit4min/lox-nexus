<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { UserDto } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AppContext } from "../../AppContext.ts"
import { ApiError } from "../../api/ApiError.ts"
import { PasswordRules } from "../../lib/PasswordRules.ts"

/** what the dialog does: add an account, set another user's password, or delete one */
export type UserDialogMode = { kind: "add" } | { kind: "password"; user: UserDto } | { kind: "delete"; user: UserDto }

/**
 * Adds, changes or deletes an account. Each asks for your own password again (the server checks
 * it), so a browser left logged in isn't enough. Passwords are cleared whenever it opens.
 */
const props = defineProps<{ mode: UserDialogMode | undefined }>()
const emit = defineEmits<{ done: [message: string] }>()
const open = defineModel<boolean>("open", { required: true })
const api = AppContext.use().users

const username = ref("")
const password = ref("")
const repetition = ref("")
const own = ref("")
const error = ref("")
const busy = ref(false)

watch(open, isOpen => {
  if (isOpen) [username.value, password.value, repetition.value, own.value, error.value] = ["", "", "", "", ""]
})

const text = computed(() => {
  const mode = props.mode
  if (mode?.kind === "password") return { title: `Set the password of ${mode.user.username}`, action: "Set password", hint: "They are logged out everywhere and log in with the new password." }
  if (mode?.kind === "delete") return { title: `Delete ${mode.user.username}`, action: "Delete user", hint: "They are logged out everywhere. What they changed keeps showing their name." }
  return { title: "Add a user", action: "Add user", hint: "Every user can do everything in Nexus; there are no roles." }
})

async function onSubmit() {
  const mode = props.mode
  if (!mode) return
  const problem = mode.kind === "delete" ? undefined : PasswordRules.problem(password.value, repetition.value)
  if (problem) return void (error.value = problem)
  busy.value = true
  error.value = ""
  try {
    if (mode.kind === "add") await api.create({ currentPassword: own.value, username: username.value.trim(), password: password.value })
    else if (mode.kind === "password") await api.setPassword(mode.user.id, { currentPassword: own.value, password: password.value })
    else await api.remove(mode.user.id, { currentPassword: own.value })
    emit("done", mode.kind === "add" ? `${username.value.trim()} can log in now.` : mode.kind === "password" ? `The password of ${mode.user.username} is set.` : `${mode.user.username} is deleted.`)
    open.value = false
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.issueFor("password") ?? failure.issueFor("username") ?? failure.message : String(failure)
  } finally {
    own.value = ""
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ text.title }}</DialogTitle>
        <DialogDescription>{{ text.hint }}</DialogDescription>
      </DialogHeader>
      <form class="grid gap-4" @submit.prevent="onSubmit">
        <div v-if="mode?.kind === 'add'" class="grid gap-2">
          <Label for="userName">Username</Label>
          <Input id="userName" v-model="username" autocomplete="off" required maxlength="64" />
        </div>
        <template v-if="mode?.kind !== 'delete'">
          <div class="grid gap-2">
            <Label for="userPassword">{{ mode?.kind === "add" ? "Password" : "New password" }}</Label>
            <Input id="userPassword" v-model="password" type="password" autocomplete="new-password" required :minlength="PasswordRules.MIN" />
            <span class="text-xs text-muted-foreground">At least {{ PasswordRules.MIN }} characters. Tell them in person, not by chat.</span>
          </div>
          <div class="grid gap-2">
            <Label for="userRepeat">Repeat it</Label>
            <Input id="userRepeat" v-model="repetition" type="password" autocomplete="new-password" required />
          </div>
        </template>
        <div class="grid gap-2 border-t pt-4">
          <Label for="userOwn">Your password</Label>
          <Input id="userOwn" v-model="own" type="password" autocomplete="current-password" required />
          <span class="text-xs text-muted-foreground">To confirm it's you.</span>
        </div>
        <Alert v-if="error" variant="destructive"><AlertDescription>{{ error }}</AlertDescription></Alert>
        <Button type="submit" :variant="mode?.kind === 'delete' ? 'destructive' : 'default'" :disabled="busy">{{ busy ? "Working…" : text.action }}</Button>
      </form>
    </DialogContent>
  </Dialog>
</template>
