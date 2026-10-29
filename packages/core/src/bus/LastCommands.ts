import type { BusMessage } from "./BusMessage.ts"
import { Topic } from "./Topic.ts"

/**
 * The last command each topic delivered: what an actuator's device was last told, for display.
 * Kept apart from the retained state on purpose: a command is never replayed, never a wire's
 * source value, and not persisted, so after a restart Nexus honestly doesn't know it. A forced
 * command counts as delivered (the device got it) and is kept without its forced flag, so it
 * stays shown after the release.
 */
export class LastCommands {
  private readonly byTopic = new Map<string, BusMessage>()

  set(message: BusMessage) {
    if (!message.flags?.forced) return void this.byTopic.set(message.topic, message)
    const flags = { ...message.flags }
    delete flags.forced
    const copy: BusMessage = { ...message, flags }
    if (Object.keys(flags).length === 0) delete copy.flags
    this.byTopic.set(message.topic, copy)
  }

  get(topic: string) {
    return this.byTopic.get(topic)
  }

  matching(pattern: string) {
    return [...this.byTopic.values()].filter(message => Topic.matches(pattern, message.topic))
  }

  forget(topic: string) {
    this.byTopic.delete(topic)
  }

  topics() {
    return [...this.byTopic.keys()]
  }
}
