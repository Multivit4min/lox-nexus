<script setup lang="ts">
import { ref, watch } from "vue"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AppContext } from "../AppContext.ts"
import { ApiError } from "../api/ApiError.ts"
import { PasswordRules } from "../lib/PasswordRules.ts"

/**
 * Changes the logged-in user's password: the current one, then the new one twice. The server
 * keeps this session (with a new cookie) and ends every other one, which the success says.
 */
const props = defineProps<{ username?: string }>()
const open = defineModel<boolean>("open", { required: true })
const { auth } = AppContext.use()

const current = ref("")
const next = ref("")
const repetition = ref("")
const error = ref("")
const busy = ref(false)
const done = ref(false)

// a dialog opened again starts empty: passwords don't stay in memory longer than needed
watch(open, isOpen => {
  if (!isOpen) return
  ;[current.value, next.value, repetition.value, error.value, done.value] = ["", "", "", "", false]
})

async function onSubmit() {
  const problem = PasswordRules.problem(next.value, repetition.value) ?? (next.value === current.value ? "The new password is the same as the current one." : undefined)
  if (problem) return void (error.value = problem)
  busy.value = true
  error.value = ""
  try {
    await auth.changePassword({ current: current.value, next: next.value })
    ;[current.value, next.value, repetition.value, done.value] = ["", "", "", true]
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.issueFor("next") ?? failure.message : String(failure)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>For {{ props.username }}. Other browsers and devices logged in as you are logged out; this one stays.</DialogDescription>
      </DialogHeader>
      <div v-if="done" class="grid gap-4">
        <Alert><AlertDescription>The password is changed. Use the new one from now on.</AlertDescription></Alert>
        <Button @click="open = false">Close</Button>
      </div>
      <form v-else class="grid gap-4" @submit.prevent="onSubmit">
        <!-- lets password managers file the new password under the right account -->
        <input type="text" name="username" autocomplete="username" :value="props.username" hidden readonly />
        <div class="grid gap-2">
          <Label for="passwordCurrent">Current password</Label>
          <Input id="passwordCurrent" v-model="current" type="password" autocomplete="current-password" required />
        </div>
        <div class="grid gap-2">
          <Label for="passwordNext">New password</Label>
          <Input id="passwordNext" v-model="next" type="password" autocomplete="new-password" required :minlength="PasswordRules.MIN" />
          <span class="text-xs text-muted-foreground">At least {{ PasswordRules.MIN }} characters.</span>
        </div>
        <div class="grid gap-2">
          <Label for="passwordRepeat">Repeat new password</Label>
          <Input id="passwordRepeat" v-model="repetition" type="password" autocomplete="new-password" required />
        </div>
        <Alert v-if="error" variant="destructive"><AlertDescription>{{ error }}</AlertDescription></Alert>
        <Button type="submit" :disabled="busy">{{ busy ? "Changing…" : "Change password" }}</Button>
      </form>
    </DialogContent>
  </Dialog>
</template>
