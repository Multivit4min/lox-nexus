import { createSharedComposable, useNow } from "@vueuse/core"

/**
 * The time, updated every second, shared by everything on the page that counts (countdowns,
 * "for 3 min"): one timer however many cells use it, stopped when none does.
 */
export const useSecondClock = createSharedComposable(() => useNow({ interval: 1000 }))
