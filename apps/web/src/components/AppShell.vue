<script setup lang="ts">
import { onMounted, ref } from "vue"
import { Cable, Puzzle, Server } from "@lucide/vue"
import { useRoute, useRouter } from "vue-router"
import { AppContext } from "../AppContext.ts"
import { VisiblePolling } from "../lib/VisiblePolling.ts"
import PasswordDialog from "./PasswordDialog.vue"
import UserMenu from "./UserMenu.vue"

const { session, updates } = AppContext.use()
// plugin updates show as a count on Plugins; the plugin pages load it again after their changes
onMounted(() => void updates.load())
VisiblePolling.use(() => updates.load(), 30 * 60_000)
const router = useRouter()
const route = useRoute()
const changingPassword = ref(false)
// a section stays marked on its detail pages (/plugins/<id>, /plugins/installed), which are separate routes
const inSection = (to: string) => route.path === to || route.path.startsWith(`${to}/`)

// what a setup is made of; the pages used now and then are in the user menu
const links = [
  { to: "/miniservers", label: "Miniservers", icon: Server },
  { to: "/plugins", label: "Plugins", icon: Puzzle },
  { to: "/wires", label: "Wires", icon: Cable }
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
          <span
            v-if="link.to === '/plugins' && updates.count.value" class="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-medium text-primary-foreground"
            :title="`${updates.count.value} plugin update${updates.count.value === 1 ? '' : 's'} available`"
          >{{ updates.count.value }}<span class="sr-only"> updates available</span></span>
        </RouterLink>
      </nav>
      <div class="ml-auto">
        <UserMenu :username="session.state.user?.username" @logout="logout" @password="changingPassword = true" />
      </div>
      <PasswordDialog v-model:open="changingPassword" :username="session.state.user?.username" />
    </header>
    <main class="min-h-0 flex-1 overflow-auto">
      <slot />
    </main>
  </div>
</template>
