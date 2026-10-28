import { Sensor, z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { EventData } from "../events/EventData.ts"
import type { HomeAssistantPlugin } from "../HomeAssistantPlugin.ts"

const params = z.object({
  // Home Assistant limits event types to 64 characters; "*" is its every-event wildcard, state_changed included
  eventType: z.string()
    .regex(/^\S{1,64}$/, "an event type without spaces, e.g. zha_event")
    .refine(eventType => eventType !== "*", "one event type, not * (every event)")
    .meta({
      title: "Event type",
      description: "The type of the events to receive, e.g. zha_event, deconz_event, hue_event or one an automation fires"
    }),
  filter: z.record(z.string(), z.unknown()).default({}).meta({
    title: "Only events with",
    description: "Event data that must match, all of it, e.g. device_ieee and command. A key may be a dot path (args.button). Leave empty for every event of the type"
  }),
  send: z.enum(["field", "pulse"]).default("field").meta({
    title: "What to send",
    description: "A data field as text (e.g. the button's command), or a pulse for each matching event",
    enumLabels: { field: "A data field as text", pulse: "A pulse (true, then false)" }
  }),
  field: z.string().min(1).default("command").meta({
    title: "Data field",
    description: "With \"a data field\": the event data field to send, e.g. command, or a dot path like args.button"
  }),
  pulseMs: z.number().int().min(50).max(3_600_000).default(1000).meta({
    title: "Pulse length (ms)",
    description: "How long the value stays before it returns to false (or empty text), so the same event again registers again; 50 to 3 600 000 ms"
  })
})

/**
 * Home Assistant events of one type (`subscribe_events`), e.g. button presses from `zha_event`,
 * as a data field's text or as a pulse. The value returns to false or empty text `pulseMs` after
 * the last matching event: the bus drops a value equal to the one before, so without the reset a
 * button pressed twice would reach Loxone once. An event during the pulse restarts the reset
 * timer. Starts at false or empty text so the target has a defined state.
 */
export class EventSensor extends Sensor<HomeAssistantPlugin, z.infer<typeof params>> {
  static readonly id = "event"
  static readonly label = "Event"
  static readonly description = "Events of one type, e.g. button presses from zha_event, as text or a pulse"
  static readonly params = params
  static readonly valueType = "any"
  private cancelReset: (() => void) | undefined

  override start() {
    this.emit(this.idle)
    this.onDispose(this.plugin.connection.busEvents.add(this.params.eventType, {
      event: data => this.received(new EventData(data)),
      subscribed: () => this.recover(),
      refused: message => this.fail(message)
    }))
  }

  private get idle() {
    return this.params.send === "pulse" ? Value.boolean(false) : Value.string("")
  }

  private received(data: EventData) {
    if (!data.matches(this.params.filter)) return
    const value = this.valueFor(data)
    if (!value) return
    this.cancelReset?.()
    this.emit(value)
    this.cancelReset = this.after(this.params.pulseMs, () => {
      this.cancelReset = undefined
      this.emit(this.idle)
    })
  }

  /** undefined when the event lacks the field (or it is empty), so nothing is sent */
  private valueFor(data: EventData) {
    if (this.params.send === "pulse") return Value.boolean(true)
    const text = data.text(this.params.field)
    return text ? Value.string(text) : undefined
  }
}
