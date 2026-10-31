<script setup lang="ts">
import { ChevronDown, Database, Play, RotateCw, Square, Trash2 } from "@lucide/vue"
import { buttonVariants } from "@/components/ui/button"
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger } from "reka-ui"

/**
 * What can be done with the instance itself, in one menu at the top right like the user menu:
 * start (or restart and stop), its stored data, and deleting it, set apart in red. An instance whose
 * plugin isn't installed can't be started or stopped.
 */
defineProps<{ stopped: boolean; available: boolean; busy: boolean }>()
const emit = defineEmits<{ start: []; restart: []; stop: []; data: []; remove: [] }>()
const item = "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
</script>

<template>
  <DropdownMenuRoot :modal="false">
    <!-- looks like the buttons beside it (Read me, Edit) -->
    <DropdownMenuTrigger :class="buttonVariants({ variant: 'outline', size: 'sm' })" aria-label="Instance menu">
      Manage <ChevronDown class="size-3.5 opacity-60" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end" :side-offset="6"
        class="z-50 min-w-44 rounded-lg bg-popover p-1 ring-1 ring-foreground/10 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
      >
        <template v-if="available">
          <DropdownMenuItem v-if="stopped" :class="item" :disabled="busy" @select="emit('start')"><Play class="size-4 text-muted-foreground" /> Start</DropdownMenuItem>
          <template v-else>
            <DropdownMenuItem :class="item" :disabled="busy" @select="emit('restart')"><RotateCw class="size-4 text-muted-foreground" /> Restart</DropdownMenuItem>
            <DropdownMenuItem :class="item" :disabled="busy" @select="emit('stop')"><Square class="size-4 text-muted-foreground" /> Stop</DropdownMenuItem>
          </template>
          <DropdownMenuSeparator class="-mx-1 my-1 h-px bg-border" />
        </template>
        <DropdownMenuItem :class="item" @select="emit('data')"><Database class="size-4 text-muted-foreground" /> Stored data…</DropdownMenuItem>
        <DropdownMenuSeparator class="-mx-1 my-1 h-px bg-border" />
        <DropdownMenuItem :class="[item, 'text-destructive data-[highlighted]:text-destructive']" @select="emit('remove')"><Trash2 class="size-4" /> Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
