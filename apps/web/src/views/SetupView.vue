<script setup lang="ts">
import type { Credentials } from "@lox-nexus/api"
import { useRouter } from "vue-router"
import { AppContext } from "../AppContext.ts"
import CredentialsForm from "../components/CredentialsForm.vue"

const { session } = AppContext.use()
const router = useRouter()

async function setup(credentials: Credentials) {
  await session.setup(credentials)
  await router.push("/")
}
</script>

<template>
  <CredentialsForm
    title="Welcome to Lox Nexus"
    description="Create the administrator account. Passwords need at least 8 characters."
    action="Create account"
    repeat
    :submit="setup"
  />
</template>
