<script setup lang="ts">
import { ref } from "vue"
import type { Credentials } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "../api/ApiError.ts"
import { PasswordRules } from "../lib/PasswordRules.ts"

/**
 * Username and password card shared by the setup and login screens. With `repeat` (setup) the
 * password is typed twice, since a typo there would lock the user out of a fresh installation.
 */
const props = defineProps<{ title: string; description: string; action: string; repeat?: boolean; submit: (credentials: Credentials) => Promise<void> }>()

const username = ref("")
const password = ref("")
const repetition = ref("")
const error = ref("")
const busy = ref(false)

async function onSubmit() {
  const problem = props.repeat ? PasswordRules.problem(password.value, repetition.value) : undefined
  if (problem) return void (error.value = problem)
  busy.value = true
  error.value = ""
  try {
    await props.submit({ username: username.value, password: password.value })
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.issueFor("password") ?? failure.message : String(failure)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{{ title }}</CardTitle>
        <CardDescription>{{ description }}</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="grid gap-4" @submit.prevent="onSubmit">
          <div class="grid gap-2">
            <Label for="username">Username</Label>
            <Input id="username" v-model="username" autocomplete="username" required />
          </div>
          <div class="grid gap-2">
            <Label for="password">Password</Label>
            <Input id="password" v-model="password" type="password" :autocomplete="repeat ? 'new-password' : 'current-password'" required minlength="8" />
          </div>
          <div v-if="repeat" class="grid gap-2">
            <Label for="passwordRepeat">Repeat password</Label>
            <Input id="passwordRepeat" v-model="repetition" type="password" autocomplete="new-password" required />
          </div>
          <Alert v-if="error" variant="destructive">
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>
          <Button type="submit" :disabled="busy">{{ action }}</Button>
          <!-- relative to the page, like the header's link; the docs need no login -->
          <a href="docs/" target="_blank" rel="noopener" class="text-center text-sm text-muted-foreground hover:underline">Documentation</a>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
