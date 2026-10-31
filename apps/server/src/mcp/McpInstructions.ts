/**
 * What an agent is told once, when it connects (`instructions` in initialize), and the longer
 * guide as a resource. Short on purpose: it is in the model's context for the whole session.
 */
export class McpInstructions {
  static readonly TEXT = `Lox Nexus connects Loxone Miniservers to other systems (Home Assistant, Fronius, UniFi, MQTT, …).
Vocabulary:
- Signal: a named value with a topic, e.g. "loxone/house/in/kitchen-light". Its owner is a Miniserver or a plugin instance.
- Loxone signals travel over Network Intercommunication (ICI). Direction "in": the Miniserver sends it (in Loxone Config an intercommunication output); "out": Nexus sends it to the Miniserver (an intercommunication input there). Each has a packet id and a data type.
- Plugin signals: a sensor reads from a device, an actuator controls one.
- Wire: carries the values of one signal to another, optionally through transforms.
- Force: a value pinned on a signal until released.
How to work:
- Call "overview" first: it describes the whole installation in one answer (signals: true adds the signal table). Then name signals by topic.
- Lists are tables (columns and rows) with a limit and a cursor; ask for less instead of more.
- Values are shown with their unit. Times are ISO 8601 in the server's time zone.
- Secrets (passwords, API tokens) are never shown and never accepted; a person enters them in the web UI.
- What you may change depends on this token's scopes; tools you can't call aren't listed.`

  static readonly GUIDE = `# Working with Lox Nexus over MCP

${McpInstructions.TEXT}

## Finding things
- "overview" gives Miniservers (health, load, signal counts), plugin instances (state, problems), wires and the problems worth a look.
- "list_signals" filters by owner, direction, value type, text, unwired, forced or stale signals.
- "get_signal" shows one signal with its value, force, wires and why a wire carries nothing.
- "list_wires" shows the wires with their health; "recent_messages" and "trace" show what went over the bus and why.
- "system_status" shows memory, load, the clock offset and whether a config import is running.

## Together with Loxone Config
Nexus names each Loxone signal by Miniserver, direction and packet id; the Loxone side needs the same packet id, the matching direction and the data type. Tools for planning and creating both sides arrive with the next step of this interface.`
}
