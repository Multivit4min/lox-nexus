<script setup lang="ts">
import { ref } from "vue"
import type { Credentials } from "@lox-nexus/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "../api/ApiError.ts"

/** Username and password card shared by the setup and login screens. */
const props = defineProps<{ title: string; description: string; action: string; submit: (credentials: Credentials) => Promise<void> }>()

const username = ref("")
const password = ref("")
const error = ref("")
const busy = ref(false)

async function onSubmit() {
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
            <Input id="password" v-model="password" type="password" autocomplete="current-password" required minlength="8" />
          </div>
          <Alert v-if="error" variant="destructive">
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>
          <Button type="submit" :disabled="busy">{{ action }}</Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
