<script setup lang="ts">
import type { Credentials } from "@lox-nexus/api"
import { useRoute, useRouter } from "vue-router"
import { AppContext } from "../AppContext.ts"
import CredentialsForm from "../components/CredentialsForm.vue"

const { session } = AppContext.use()
const route = useRoute()
const router = useRouter()

async function login(credentials: Credentials) {
  await session.login(credentials)
  // only follow local paths, so a crafted link can't send the user elsewhere after login
  const next = typeof route.query.next === "string" && route.query.next.startsWith("/") && !route.query.next.startsWith("//") ? route.query.next : "/"
  await router.push(next)
}
</script>

<template>
  <CredentialsForm title="Lox Nexus" description="Log in to continue." action="Log in" :submit="login" />
</template>
