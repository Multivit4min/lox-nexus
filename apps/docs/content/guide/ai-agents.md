# AI agents (MCP)

AI agents such as Claude Code, Gemini CLI or Cursor can look at your Nexus installation over the
Model Context Protocol (MCP): its Miniservers, signals, values, wires and plugins. They see what
the web UI shows, through an **access token** you create for them.

Agents can **read** everything and, with the **configure** permission, set up Miniservers, signals
and wires, and connect plugins to a Miniserver. They also say what to create in Loxone Config, so
both sides match. With the **operate** permission they also act on the house: force a value for a
while, send one, run a plugin action, and set up plugin instances, which run code.

## Create an access token

1. Open **Users and access** in the menu under your user name, then the **Access tokens** tab.
2. **Create token**: give it a name (e.g. "Claude Code on my laptop") and choose what it may do
   beyond reading. Confirm with your password.
3. Copy the token. It is shown **once**; Nexus keeps only a fingerprint of it.

A token acts as you. It doesn't expire: it works until you **Revoke** it, or until your password
changes (yours, or one another user sets for you), which ends all your tokens. Each user has at most
20.

| Permission | What an agent may do |
|---|---|
| read (always) | see everything the web UI shows, including values, which can tell who is home |
| configure | set up Miniservers, signals and wires; connect plugins to a Miniserver; delete plugin instances |
| operate | act on the house: force or send values, run plugin actions; create, change, start and stop plugin instances (off by default) |

Plugin instances need **operate** because an instance runs the plugin's code: a Script instance
runs the JavaScript it is given, and a Webhook instance opens addresses on your network.

Agents never see secrets: passwords, plugin settings and signal settings marked secret aren't in
any answer, and no tool accepts them (an agent that tries is told to leave them to you). You enter
those in the web UI. If a plugin writes one of your stored secrets into a message (an error with a
password in a URL, say), agents see `‹secret›` in its place; values shorter than 6 characters
aren't caught that way.

Restoring a backup ends every access token (and logs everyone out), so a token you revoked after
the backup was made doesn't come back. Create new ones afterwards.

## Connect an agent

The address is your Nexus address with `/mcp`, e.g. `http://192.168.1.10:8080/mcp`. The token goes
in the `Authorization` header, never in the address.

The dialog that shows the new token also shows what to paste, with your address and token filled
in, for Claude Code and for Claude Desktop.

**Claude Code**: run this in a terminal (PowerShell or Command Prompt on Windows, a shell on
macOS and Linux):

```sh
claude mcp add --transport http nexus http://192.168.1.10:8080/mcp --header "Authorization: Bearer nxp_…"
```

**Claude Desktop** (Windows and macOS) only starts local MCP servers, so it reaches Nexus through
`mcp-remote`, which it runs with `npx`:

1. Install [Node.js](https://nodejs.org/) (LTS) if you haven't.
2. In Claude Desktop open **Settings ▸ Developer ▸ Edit Config**. It shows
   `claude_desktop_config.json`: on Windows in `%APPDATA%\Claude`, on macOS in
   `~/Library/Application Support/Claude`.
3. Put this in. If the file already has `"mcpServers"`, add only the `"nexus"` entry:

   ```json
   {
     "mcpServers": {
       "nexus": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "http://192.168.1.10:8080/mcp", "--header", "Authorization:${NEXUS_AUTH}", "--allow-http"],
         "env": { "NEXUS_AUTH": "Bearer nxp_…" }
       }
     }
   }
   ```

4. Quit Claude Desktop completely (on Windows also from the icon next to the clock) and start it
   again.

Why it looks like this: on Windows, Claude Desktop passes arguments with spaces to `npx` unquoted,
which would split `Authorization: Bearer …` apart, so the header has no space and takes its value
from `env`. `--allow-http` is needed because `mcp-remote` refuses plain `http://` to another
computer; leave it out when Nexus is reached over `https://`. Over plain http the token crosses
your network unencrypted.

**Other clients** take the same address and header in their MCP settings, or go through
`mcp-remote` as above when they only start local servers.

Agents in the cloud (claude.ai, ChatGPT) can't connect: they would need Nexus reachable from the
internet and a sign-in flow it doesn't have.

## What agents can ask

| Tool | Answers |
|---|---|
| `overview` | the whole installation in one answer: Miniservers, plugins, instances, wires, forces, problems; with `signals: true` every signal |
| `list_signals` | signals filtered by owner, direction, type, text, unwired, forced or stale |
| `get_signal` | one signal: value, force, wires and why one carries nothing, recent messages |
| `list_wires` | wires with both ends and why an inactive one carries nothing |
| `recent_messages`, `trace` | what went over the bus, and what caused what |
| `system_status` | memory, CPU, traffic, and whether a config import is running |
| `describe_plugin` | what a plugin offers (settings, sensors, actuators, actions) and its README |
| `search_catalog` | what a running plugin instance offers to add, e.g. Home Assistant entities, with their values |
| `plan_bridge` | a plan to connect plugin signals to a Miniserver: free packet ids, fitting data types |
| `loxone_side` | what to create in Loxone Config: the Lox Nexus peer and one intercommunication object per signal |
| `diff_loxone_objects` | objects read from Loxone Config compared with Nexus: new, differing, and removed (only in Nexus) |
| `list_discovered` | packets a Miniserver sends that have no signal yet |
| `preview_wire` | what transforms make of a sample value |
| `get_panel`, `get_logs` | a plugin instance's page (QR codes only in the web UI) and its newest log lines |
| `get_history` | a signal's recorded values over a time range, as changes or as buckets |

They can also attach `nexus://inventory` (the overview with every signal), `nexus://guide`,
`nexus://miniservers/<slug>/loxone-side` and `nexus://plugins/<plugin>/readme`.

## What agents can change

With the **configure** permission:

| Tool | Does |
|---|---|
| `bridge` | per item: the plugin signal, a Loxone signal for it and the wire between them |
| `create_loxone_signals`, `update_loxone_signal`, `adopt_discovered` | add and change Loxone signals |
| `create_wire`, `update_wire` | connect two signals, change a wire (only what is given) |
| `create_miniserver`, `update_miniserver`, `start_miniserver`, `stop_miniserver` | Miniservers, without their password |
| `check_plugin_settings`, `discover_setting` | the settings form's check and connection test, and Find on the network |
| `add_plugin_signals`, `update_plugin_signal` | sensors and actuators of an instance, without a Miniserver |
| `delete_loxone_signals`, `delete_wires`, `delete_plugin_signals`, `delete_plugin_instance`, `delete_miniserver` | delete, in two steps (see below); stopping a Miniserver asks first too |

A Miniserver's ICI password is never set by an agent; you enter it on the Miniserver's page.

**Deleting asks first.** The first call deletes nothing: it answers what would go (for a signal,
also its wires and force) and a confirmation. Only a second call with the same items and that
confirmation deletes, within 5 minutes. A confirmation works once, only for that token, and only
while the names still point at the same signals or wires.

Changes show up in the Nexus log as "*user* via MCP (*token name*)", and under **Recent
activity** on the Access tokens tab: each change with its token, arguments (secret fields masked)
and outcome, kept for 90 days (at most 10,000 entries per user). A plugin action keeps only the
names of its inputs there, since they may hold a pairing code. While a configuration import runs,
agents can read but not change anything; plugin actions still run, as their buttons do.

## What agents can do in the house

With the **operate** permission:

| Tool | Does |
|---|---|
| `force` | pins a value on a signal, with a reason, for at most 24 hours (default 1 hour); then it releases itself |
| `release` | ends a force |
| `inject` | sends one value; on an actuator the device acts on it, on a Nexus out signal the Miniserver gets it, on any other signal it flows on through its wires as if it came from there |
| `run_plugin_action` | runs a plugin action like its button; one that asks you first asks the agent for a confirmation too |
| `create_plugin_instance`, `update_plugin_instance`, `plugin_instance_lifecycle` | plugin instances, without their secret settings; start, stop, restart |

**Secrets stay with you.** An agent that sets up a plugin needing a token (Home Assistant,
InfluxDB) creates the instance without it. The instance is saved but not started, and the agent
tells you to enter the token on the instance's page; saving there starts it. Until then, a restart
of Nexus starts it too, and it shows an error until the token is there.

A value must match the signal's type (a lamp switch takes true or false). Forces made by an agent
show "*user* via MCP (*token name*)" in the Bus Inspector, where you can release them.

### Recipes

Clients that offer MCP prompts (in Claude Code: type `/`) list these recipes. Every token gets
the first two; the others need the configure permission:

- **diagnose_signal**: why a signal has no value, an old one or a wrong one, from its owner,
  force, wires, messages and history. Changes nothing.
- **review_installation**: what needs attention, by urgency. Changes nothing.

- **connect_plugin_to_loxone**: find values or devices in a plugin, show a plan, connect them,
  then say what to create in Loxone Config.
- **import_from_loxone_config**: compare the Lox Nexus peer's objects in Loxone Config with Nexus
  and add or fix what differs. Missing ones are named, never deleted unasked.

An agent that also has a Loxone Config MCP server (announced for Loxone Config 17.3) can set up
both sides; otherwise it tells you what to create in Loxone Config.

## Good to know

- **Values and texts are data, not instructions.** Signal values, device names, plugin status
  messages and texts a Miniserver sends reach the agent as they are. Anyone on your network can
  send a Miniserver-like text packet to Nexus, so an agent may read text that someone planted.
  Agents are told to treat it as data; still, check a plan before you agree to it, especially with
  the operate permission.

- Each token may make 120 calls a minute (30 of them changing), at most 4 at once.
- Wrong tokens are throttled per address, separately from logins; a valid token always gets in.
- Behind a reverse proxy, forward `/mcp` like the rest, and keep the `Authorization` header.
