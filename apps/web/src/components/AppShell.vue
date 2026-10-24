<script setup lang="ts">
import { Activity, LogOut, Puzzle, Server } from "@lucide/vue"
import { useRouter } from "vue-router"
import { Button } from "@/components/ui/button"
import { AppContext } from "../AppContext.ts"

const { session } = AppContext.use()
const router = useRouter()

const links = [
  { to: "/miniservers", label: "Miniservers", icon: Server },
  { to: "/plugins", label: "Plugins", icon: Puzzle },
  { to: "/inspector", label: "Bus Inspector", icon: Activity }
]

async function logout() {
  await session.logout()
  await router.push({ name: "login" })
}
</script>

<template>
  <div class="flex h-screen flex-col bg-background text-foreground">
    <header class="flex items-center gap-6 border-b px-4 py-2">
      <span class="font-semibold">Lox Nexus</span>
      <nav class="flex gap-1">
        <RouterLink
          v-for="link in links" :key="link.to" :to="link.to"
          class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          active-class="bg-accent text-accent-foreground"
        >
          <component :is="link.icon" class="size-4" />
          {{ link.label }}
        </RouterLink>
      </nav>
      <div class="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
        {{ session.state.user?.username }}
        <Button variant="ghost" size="icon" title="Log out" @click="logout">
          <LogOut class="size-4" />
        </Button>
      </div>
    </header>
    <main class="min-h-0 flex-1 overflow-auto">
      <slot></slot>
    </main>
  </div>
</template>
