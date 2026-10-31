# 0020: An MCP interface for agents: our own stateless server on `/mcp`, scoped access tokens, generic tools

Status: **Proposed** (2026-10-31). Design in `architecture.md`, "Design: MCP interface (A1–A4)";
milestone "MCP interface" in `roadmap.md`. The user decided operating devices, token lifetime,
plugin actions, cloud clients and installing plugins on 2026-10-31 (see the design's "Decided");
the questions left are listed there.

## Context

The owner wants AI agents to inspect and set up Nexus, together with Loxone's own MCP servers:
- **Loxone Config & App 17.1** runs an MCP server on the Miniserver for the running installation
  (states, operating blocks).
- **Loxone Config 17.3** is announced to add one for the Config project (adding objects). Nothing
  about it is published yet.

The goal is that one agent creates both sides of a link: the objects in Loxone Config, and the
plugin signal, Loxone signal and wire in Nexus. Names, packet ids and data types must match.

A LoxForum report says Loxone's server is slow because agents keep searching for blocks. Agents
need a compact inventory, not many lookups.

What Nexus has:
- **Login:** users and cookie sessions (ADR 0004). There are no tokens, no roles, and every user
  is an admin.
- **Services** behind the REST controllers already validate, undo and clean up. This includes
  the bridge flow (`PluginBridgeService`), the project diff and the plugin actions with zod and
  JSON Schema inputs.
- **`ChangeLock`** guards config imports.
- **Secrets:** they never appear in DTOs, but plugin panels may show them on purpose. The webhook
  plugin shows its token.

Considered:
- **The official TypeScript SDK at run time.** It is complete and follows spec changes, but:
  - it brings express, hono, cors, jose, ajv and cross-spawn into the server
  - its transport writes to the raw response, outside Fastify's error handling and hooks
  - its high-level API wants zod shapes, not the JSON Schemas plugins describe themselves with
- **stdio.** Nexus runs as a service, often in Docker on another host, and only one process may
  open the database. A stdio server would be a proxy to HTTP anyway, and generic bridges
  (`mcp-remote`) exist.
- **One MCP tool per plugin action, or plugins contributing tools.** This gives a tool list that
  changes at run time and grows with every plugin. A stateless server can't announce the
  changes. Authors would need to learn MCP concepts. The SDK and the wire protocol would grow.
- **Session cookies, or the user's password, for agents.** They are not scoped, and an agent
  can't hold a cookie for long. They are also the wrong unit to revoke.
- **Elicitation for confirmations.** It needs a stream inside the request, and clients support
  it unevenly.

## Decision

- **Transport:** Streamable HTTP, **stateless, JSON answers only**, at `POST /mcp` on the existing
  Fastify server, inside the API scope so `AuthGuard` and the Origin check cover it.
  - No sessions, no SSE, no stdio.
  - Protocol versions 2025-03-26 to 2025-11-25 are negotiated from a list.
- **Our own small server implementation** in `apps/server/src/mcp/`: JSON-RPC with zod, a
  dispatcher, tool, resource and prompt registries, one class per tool.
  - The official SDK is only a devDependency: its client drives the conformance tests.
  - Changing to the SDK later stays possible behind `McpController`.
- **Auth: personal access tokens with scopes**, per user, for `/mcp` only.
  - Scopes: `read`, `configure` and `operate`.
  - Only the SHA-256 is stored. Tokens don't expire; revoking ends one at once, and a password
    change ends all of the user's.
  - Tokens are created and revoked only with a session, in the UI.
  - `/mcp` ignores cookies, and the REST API ignores bearer tokens.
  - `tools/list` shows only what the token's scopes allow.
- **Write scope:**
  - `configure` covers setup: signals, wires, the bridge, and from A3 Miniservers and plugin
    instances.
  - `operate` (off by default) covers acting on devices: force (it must expire within 24 h),
    release, inject, plugin actions.
  - **Never offered**, whatever the scope: plugin install, update or uninstall, config import,
    backup and restore, users and tokens, the plugin store, and secret values in either
    direction. A human enters secrets in the UI; the tools name what is missing.
  - Destructive tools need a second call with a confirmation id. The first call returns what
    would go with the change.
- **Every tool reuses the services the REST API uses.** Pure web helpers (`PacketIds`,
  `DataTypes`, `ProjectDiff`, `CatalogTree`, `WireHealth`, `BridgeDraft`) move into
  `packages/api`, so the server and the web share one copy. Logic still held in a controller
  (`BusController`) moves into a service first.
- **The overview problem:**
  - server instructions with the vocabulary and the Loxone workflow
  - one `overview` call (also as the `nexus://inventory` resource) that returns the whole
    installation compactly, with the signal table up to 1500 signals
  - signals named by topic
  - table-shaped lists with limits and cursors
  - server-side catalog search
- **Loxone interplay:**
  - Nexus describes what the Loxone side needs (`loxone_side`: the peer, and per signal the
    object kind from Loxone's point of view, packet id, data type, name and description).
  - Nexus suggests packet ids and data types before creating anything (`plan_bridge`), and takes
    objects read from Config back through `ProjectDiff` (`diff_loxone_objects`).
  - Nexus goes first in a joint setup, because it checks uniqueness and types.
  - Nexus neither wraps nor calls Loxone's MCP servers.
- **Plugins contribute no tools.** Actions, catalogs, panels and logs reach agents through
  generic tools (`run_plugin_action`, `search_catalog`, `get_panel`, `get_logs`). An action's
  existing `confirm` becomes the MCP confirmation.
  - Every action is available to agents with `operate`; authors can't withhold one.
  - A `SecretRedactor` replaces an instance's stored secret values in every tool result, since
    panels and logs are plugin-controlled text.
- **Audit and limits:**
  - Changes carry `by = "<user> via MCP (<token name>)"` and an info log line per call, plus
    an audit table from A3.
  - Per token: 120 calls per minute (30 of them changing), 4 at once, and changing calls one at
    a time.
  - Results are cut at 64 KB.
  - `/mcp` is `lockFree`; changing tools take the `ChangeLock` through a new `enter()`, so reads
    go on during an import.

## Consequences

- Agents get every setup path the UI has, minus code installation and secrets, with the same
  validation, undo and cleanup. A fix in a service fixes both.
- A new dependency footprint is avoided. The cost is following the MCP spec ourselves: about ten
  small classes, a conformance test with the reference client, and a version list to extend.
- Stateless HTTP means:
  - no server-initiated messages: no progress, no elicitation, no subscriptions, no
    `listChanged`
  - long plugin actions block their request for up to 2 minutes

  Adding SSE later is additive.
- Cloud-hosted clients (claude.ai connectors, ChatGPT) can't connect without OAuth and a public
  address. Local agents connect with a bearer token, and stdio-only clients use `mcp-remote`.
- Confirmations show the blast radius but can't stop an agent that confirms itself. Real human
  approval needs elicitation or an approval step in the UI, both left out.
- `packages/api` grows from a DTO package to DTOs plus shared pure helpers. Its `CLAUDE.md` should
  say so when the helpers move.
- What an agent can do with Loxone Config depends on Config 17.3, which is unpublished. If it
  creates only Virtual inputs and outputs rather than intercommunication objects, `loxone_side`
  needs a second kind of descriptor, and the link may go through the webhook plugin or ADR 0016.
  A1 doesn't depend on it.
- Nexus doesn't know the address the Miniserver reaches it at. Until a setting exists (open
  question 5), the descriptor may say "ask the user".
- Values readable with `read` can reveal presence. `configure` can change what reaches devices
  through wires. `operate` acts directly. The token page says this when scopes are chosen.
