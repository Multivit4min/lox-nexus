/**
 * Tells the bus whether a topic carries states or commands, from the signal declarations.
 * Used to deliver forced values the right way even before any real message was seen.
 */
export interface TopicKinds {
  kindOf(topic: string): "state" | "command" | undefined
}
