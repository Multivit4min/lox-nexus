import type { BusMessageDto, ForceDto, StreamEvent } from "@lox-nexus/api"
import { reactive, shallowRef } from "vue"
import type { BusApi } from "../api/BusApi.ts"
import type { StreamConnection, StreamHandlers, StreamState } from "../api/StreamConnection.ts"
import { RingBuffer } from "../lib/RingBuffer.ts"

export type MessageKind = BusMessageDto["kind"]

/**
 * State of the Bus Inspector. The server filters by topic pattern; kind and text filters run here.
 * Messages land in a ring buffer and the rendered list is replaced once per stream batch (every
 * 50 ms), so the cost per second doesn't grow with the message rate. Paused, the buffer keeps
 * filling but the list stays still until resumed.
 */
export class InspectorStore {
  static readonly CAPACITY = 5000
  readonly messages = shallowRef<BusMessageDto[]>([])
  readonly forces = shallowRef<ForceDto[]>([])
  readonly state = reactive({
    pattern: "#",
    text: "",
    kinds: new Set<MessageKind>(["state", "command", "result", "force", "release", "event"]),
    paused: false,
    /** messages that arrived while paused */
    missed: 0,
    /** messages the server dropped because this client was too slow */
    dropped: 0,
    connection: "connecting" as StreamState
  })
  private readonly buffer = new RingBuffer<BusMessageDto>(InspectorStore.CAPACITY)
  private readonly stream: StreamConnection

  /** @param connect usually AppContext.stream */
  constructor(private readonly api: BusApi, connect: (handlers: StreamHandlers) => StreamConnection) {
    this.stream = connect({ onEvent: event => this.onEvent(event), onState: state => (this.state.connection = state) })
  }

  /** loads recent history, then follows the live stream */
  async open() {
    this.stream.subscribe("bus", this.state.pattern)
    this.stream.open()
    await Promise.all([this.loadHistory(), this.loadForces()])
  }

  close() {
    this.stream.close()
  }

  /** a new server-side topic filter; the list restarts with that pattern's history */
  async follow(pattern: string) {
    this.state.pattern = pattern || "#"
    this.buffer.clear()
    this.stream.subscribe("bus", this.state.pattern)
    await this.loadHistory()
  }

  /** the rendered list with the kind and text filters applied */
  visible(): BusMessageDto[] {
    const { kinds, text } = this.state
    const needle = text.trim().toLowerCase()
    return this.messages.value.filter(m => kinds.has(m.kind) && (!needle || m.topic.includes(needle) || m.source.label?.toLowerCase().includes(needle)))
  }

  /** client-side filter on topic and source label */
  setText(text: string) {
    this.state.text = text
  }

  toggleKind(kind: MessageKind) {
    if (!this.state.kinds.delete(kind)) this.state.kinds.add(kind)
  }

  setPaused(paused: boolean) {
    this.state.paused = paused
    if (!paused) this.render()
  }

  clear() {
    this.buffer.clear()
    this.render()
  }

  async loadForces() {
    this.forces.value = await this.api.forces()
  }

  private async loadHistory() {
    this.buffer.push(await this.api.recent(500, this.state.pattern))
    this.render()
  }

  private onEvent(event: StreamEvent) {
    if (event.type === "gap") this.state.dropped += event.dropped
    if (event.type !== "bus") return
    this.buffer.push(event.messages)
    if (event.messages.some(m => m.kind === "force" || m.kind === "release")) void this.loadForces()
    if (this.state.paused) this.state.missed += event.messages.length
    else this.render()
  }

  private render() {
    this.state.missed = 0
    this.messages.value = this.buffer.toArray()
  }
}
