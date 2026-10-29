<script setup lang="ts">
import { computed } from "vue"
import { Activity, BookOpen, ChartLine, ChevronDown, DatabaseBackup, Gauge, LogOut, UserRound } from "@lucide/vue"
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger } from "reka-ui"
import { useRoute } from "vue-router"

/**
 * The pages used now and then (watching the bus, history settings, backup, diagnostics), the docs
 * and logging out, under the user's name. While one of its pages is open the button is marked and
 * names that page, so the header still says where you are.
 */
const props = defineProps<{ username?: string }>()
const emit = defineEmits<{ logout: [] }>()
const route = useRoute()

const pages = [
  { to: "/inspector", label: "Bus Inspector", icon: Activity },
  { to: "/history", label: "History", icon: ChartLine },
  { to: "/backup", label: "Backup", icon: DatabaseBackup },
  { to: "/system", label: "System", icon: Gauge }
]
const current = computed(() => pages.find(page => route.path === page.to || route.path.startsWith(`${page.to}/`)))
const item = "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
</script>

<template>
  <DropdownMenuRoot :modal="false">
    <DropdownMenuTrigger
      class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring md:px-3"
      :class="current && 'bg-accent text-accent-foreground'" :aria-label="`Menu of ${props.username ?? 'the user'}`"
    >
      <component :is="current?.icon ?? UserRound" class="size-4" />
      <span class="hidden sm:inline">{{ current?.label ?? props.username }}</span>
      <ChevronDown class="size-3.5 opacity-60" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end" :side-offset="6"
        class="z-50 min-w-48 rounded-lg bg-popover p-1 ring-1 ring-foreground/10 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
      >
        <DropdownMenuLabel class="px-2 py-1.5 text-xs text-muted-foreground">Signed in as <span class="font-medium text-foreground">{{ props.username }}</span></DropdownMenuLabel>
        <DropdownMenuSeparator class="-mx-1 my-1 h-px bg-border" />
        <DropdownMenuItem v-for="page in pages" :key="page.to" as-child>
          <RouterLink :to="page.to" :class="[item, current?.to === page.to && 'font-medium text-foreground']" :aria-current="current?.to === page.to ? 'page' : undefined">
            <component :is="page.icon" class="size-4 text-muted-foreground" /> {{ page.label }}
          </RouterLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator class="-mx-1 my-1 h-px bg-border" />
        <DropdownMenuItem as-child>
          <!-- relative to the page (hash routes), so it also works behind a proxy prefix -->
          <a href="docs/" target="_blank" rel="noopener" :class="item"><BookOpen class="size-4 text-muted-foreground" /> Docs</a>
        </DropdownMenuItem>
        <DropdownMenuSeparator class="-mx-1 my-1 h-px bg-border" />
        <DropdownMenuItem :class="item" @select="emit('logout')"><LogOut class="size-4 text-muted-foreground" /> Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
