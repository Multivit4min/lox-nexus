<script setup lang="ts">
import { Activity, BookOpen, Cable, ChartLine, DatabaseBackup, LogOut, Puzzle, Server } from "@lucide/vue"
import { useRoute, useRouter } from "vue-router"
import { Button } from "@/components/ui/button"
import { AppContext } from "../AppContext.ts"

const { session } = AppContext.use()
const router = useRouter()
const route = useRoute()
// a section stays marked on its detail pages (/plugins/<id>, /plugins/installed), which are separate routes
const inSection = (to: string) => route.path === to || route.path.startsWith(`${to}/`)

const links = [
  { to: "/miniservers", label: "Miniservers", icon: Server },
  { to: "/plugins", label: "Plugins", icon: Puzzle },
  { to: "/wires", label: "Wires", icon: Cable },
  { to: "/inspector", label: "Bus Inspector", icon: Activity },
  { to: "/history", label: "History", icon: ChartLine },
  { to: "/backup", label: "Backup", icon: DatabaseBackup }
]

async function logout() {
  await session.logout()
  await router.push({ name: "login" })
}
</script>

<template>
  <div class="flex h-screen flex-col bg-background text-foreground">
    <!-- below md the links show icons only (named for screen readers and tooltips), so a phone needs no sideways scrolling -->
    <header class="flex items-center gap-2 border-b px-2 py-2 sm:gap-6 sm:px-4">
      <span class="font-semibold whitespace-nowrap">Lox Nexus</span>
      <nav class="flex gap-1">
        <RouterLink
          v-for="link in links" :key="link.to" :to="link.to" :title="link.label"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground md:px-3"
          :class="inSection(link.to) && 'bg-accent text-accent-foreground'" :aria-current="inSection(link.to) ? 'page' : undefined"
        >
          <component :is="link.icon" class="size-4" />
          <span class="sr-only md:not-sr-only">{{ link.label }}</span>
        </RouterLink>
      </nav>
      <div class="ml-auto flex items-center gap-1 text-sm text-muted-foreground sm:gap-2">
        <!-- relative to the page (hash routes), so it also works behind a proxy prefix -->
        <a href="docs/" target="_blank" rel="noopener" title="Docs" class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent hover:text-accent-foreground md:px-3">
          <BookOpen class="size-4" />
          <span class="sr-only md:not-sr-only">Docs</span>
        </a>
        <span class="hidden sm:inline">{{ session.state.user?.username }}</span>
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
