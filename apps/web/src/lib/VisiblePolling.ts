import { useDocumentVisibility, useIntervalFn } from "@vueuse/core"
import { watch } from "vue"

/**
 * Periodic refreshes that pause while the browser tab is hidden and catch up once when it is shown
 * again, so a page left open in the background costs the server nothing.
 */
export class VisiblePolling {
  /**
   * Call in a component's setup; stops with the component.
   * @param when an extra condition, e.g. no form open; the work is skipped while it is false
   */
  static use(work: () => unknown, ms: number, when: () => boolean = () => true) {
    const visibility = useDocumentVisibility()
    useIntervalFn(() => visibility.value === "visible" && when() && work(), ms)
    watch(visibility, now => now === "visible" && when() && work())
  }
}
