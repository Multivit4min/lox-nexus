import type { McpPrompt } from "./McpPrompt.ts"

/** The recipes of A2 (ADR 0020): the two tasks that span Nexus and Loxone Config. */
export class McpPrompts {
  static readonly CONNECT_PLUGIN: McpPrompt = {
    name: "connect_plugin_to_loxone",
    title: "Connect plugin signals to a Miniserver",
    description: "Find values or devices in a plugin (e.g. Home Assistant entities), connect them to a Miniserver, and say what to create in Loxone Config.",
    arguments: [
      { name: "instance", description: "the plugin instance's slug", required: true },
      { name: "miniserver", description: "the Miniserver's slug", required: true },
      { name: "what", description: "what to connect, in words, e.g. \"all room temperatures\"" }
    ],
    scope: "configure",
    text: args => `Connect signals of the plugin instance "${args.instance}" to the Miniserver "${args.miniserver}"${args.what ? `: ${args.what}` : ""}.

1. describe_plugin for "${args.instance}" to learn what its sensors and actuators do.
2. search_catalog to find the matching entries (and list_signals for signals that exist already). Ask me when it is ambiguous.
3. plan_bridge with them. Show me the plan as a table: name, sensor or actuator, packet id, data type. Change it as I say.
4. Only after I agree: bridge with the plan's items. Report what failed and why.
5. loxone_side for "${args.miniserver}" with the new topics: tell me what to create in Loxone Config, or create it with a Loxone Config tool if you have one. Packet id, direction and data type must match exactly.
6. Afterwards check with get_signal that values arrive.`
  }

  static readonly IMPORT_FROM_CONFIG: McpPrompt = {
    name: "import_from_loxone_config",
    title: "Take over signals from Loxone Config",
    description: "Compare the intercommunication objects of the Nexus peer in Loxone Config with the Loxone signals in Nexus, and add or fix the ones that differ.",
    arguments: [{ name: "miniserver", description: "the Miniserver's slug", required: true }],
    scope: "configure",
    text: args => `Bring the Loxone signals of the Miniserver "${args.miniserver}" in line with Loxone Config.

1. Read the intercommunication inputs and outputs of the Lox Nexus peer in Loxone Config: with a Loxone Config tool if you have one, else ask me to paste them (name, packet id, data type, input or output).
2. diff_loxone_objects with all of them. In Nexus terms an intercommunication output is direction "in", an input is "out".
3. Show me the new and differing rows. Only after I agree: create_loxone_signals for new ones, update_loxone_signal for differing ones (with the input diff_loxone_objects gave).
4. "removed" signals exist in Nexus only. Name them, but delete nothing unless I ask; deleting takes their wires along.`
  }

  static readonly DIAGNOSE_SIGNAL: McpPrompt = {
    name: "diagnose_signal",
    title: "Why is this signal wrong?",
    description: "Find out why a signal has no value, an old value or an unexpected one: its owner, force, wires and recent messages.",
    arguments: [{ name: "signal", description: "the signal's topic, or what the user calls it", required: true }],
    scope: "read",
    text: args => `Find out what is wrong with the signal "${args.signal}". Change nothing; explain, and suggest fixes.

1. If that isn't a topic, find it with list_signals (search). Ask me if several match.
2. get_signal: its value and when it came, a force, stale, its wires and why one carries nothing.
3. Its owner: for a Miniserver, overview (health, load) and, for an in signal, list_discovered (is the Miniserver sending a different packet id or type?); for a plugin, get_panel and get_logs of its instance.
4. recent_messages for its topic, and trace on a message that looks wrong, to see what caused it.
5. get_history if it helps to see when it started.
Tell me the cause in one or two sentences, then the evidence, then what I could do (and which tool would do it).`
  }

  static readonly REVIEW_INSTALLATION: McpPrompt = {
    name: "review_installation",
    title: "Review the installation",
    description: "Look for what needs attention: inactive wires, stale and unwired signals, busy Miniservers, degraded plugin instances.",
    arguments: [],
    scope: "read",
    text: () => `Review this Lox Nexus installation. Change nothing.

1. overview: the problems list, Miniserver health and load (over 70 % is busy), plugin instances that aren't running or are degraded.
2. list_wires with inactiveOnly: wires that carry nothing, and why.
3. list_signals with stale: true, then unwired: true: signals without values, and signals nothing uses.
4. For each degraded instance: get_panel and get_logs (warn and above).
5. system_status: memory, load and the clock offset.
Report by urgency: broken (values don't flow), worth fixing, tidy-up. One line each, with the topic or instance, and what would fix it.`
  }

  static readonly ALL: readonly McpPrompt[] = [McpPrompts.CONNECT_PLUGIN, McpPrompts.IMPORT_FROM_CONFIG, McpPrompts.DIAGNOSE_SIGNAL, McpPrompts.REVIEW_INSTALLATION]
}
