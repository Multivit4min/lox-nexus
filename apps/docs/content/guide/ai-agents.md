# AI agents (MCP)

AI agents such as Claude Code, Gemini CLI or Cursor can look at your Nexus installation over the
Model Context Protocol (MCP): its Miniservers, signals, values, wires and plugins. They see what
the web UI shows, through an **access token** you create for them.

This first version lets agents **read**. Setting up signals and wires, and operating devices, come
in later versions; the token's permissions for them are already there.

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
| configure | set up signals, wires and plugin instances (coming) |
| operate | act on devices: force values, run plugin actions (coming; off by default) |

Agents never see secrets: passwords, plugin settings and signal settings marked secret aren't in
any answer, and no tool accepts them. You enter those in the web UI.

Restoring a backup ends every access token (and logs everyone out), so a token you revoked after
the backup was made doesn't come back. Create new ones afterwards.

## Connect an agent

The address is your Nexus address with `/mcp`, e.g. `http://192.168.1.10:8080/mcp`. The token goes
in the `Authorization` header, never in the address.

**Claude Code** (the dialog shows this line ready to copy):

```sh
claude mcp add --transport http nexus http://192.168.1.10:8080/mcp --header "Authorization: Bearer nxp_…"
```

**Other clients** take the same address and header in their MCP settings. A client that only
starts local MCP servers (stdio) goes through `mcp-remote`, for example in Claude Desktop's
configuration file:

```json
{
  "mcpServers": {
    "nexus": {
      "command": "npx",
      "args": ["mcp-remote", "http://192.168.1.10:8080/mcp", "--header", "Authorization: Bearer nxp_…"]
    }
  }
}
```

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

They can also attach `nexus://inventory` (the overview with every signal) and `nexus://guide`.

## Good to know

- Each token may make 120 calls a minute (30 of them changing), at most 4 at once.
- Wrong tokens are throttled per address, separately from logins; a valid token always gets in.
- Behind a reverse proxy, forward `/mcp` like the rest, and keep the `Authorization` header.
