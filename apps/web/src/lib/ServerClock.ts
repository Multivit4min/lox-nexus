import { createSharedComposable, useIntervalFn } from "@vueuse/core"
import { ref } from "vue"
import { AppContext } from "../AppContext.ts"
import { ClockOffset, type ClockReading } from "./ClockOffset.ts"

/**
 * How far the server's clock is off from this browser's: measured once for the page and again
 * every 10 minutes, shared by everything that shows server times; undefined until measured. A
 * failed measurement keeps the last one.
 */
export const useServerClock = createSharedComposable(() => {
  const api = AppContext.use().diagnostics
  const offset = new ClockOffset(() => api.serverNow())
  const reading = ref<ClockReading>()
  const measure = async () => {
    try {
      reading.value = await offset.measure()
    } catch {
      return
    }
  }
  void measure()
  useIntervalFn(measure, 10 * 60_000)
  return { reading, measure }
})
