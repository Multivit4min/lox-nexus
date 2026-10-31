import { createSharedComposable, useNow } from "@vueuse/core"
import { computed } from "vue"
import { useServerClock } from "./ServerClock.ts"

/**
 * The server's time, updated every second, shared by everything on the page that counts
 * (countdowns, "for 3 min", "12 s ago"): one timer however many cells use it, stopped when none
 * does. Those times come from the server's clock, so the browser's is shifted by how far the two
 * are apart; a host clock seconds ahead would otherwise show a poll "in 3 s".
 */
export const useSecondClock = createSharedComposable(() => {
  const now = useNow({ interval: 1000 })
  const { reading } = useServerClock()
  return computed(() => new Date(now.value.getTime() + (reading.value?.offsetMs ?? 0)))
})
