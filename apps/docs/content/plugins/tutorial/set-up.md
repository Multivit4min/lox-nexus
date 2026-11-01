# 1. Set up

In this step you start Nexus from source and the fake plug. You see the Nexus web interface in
your browser and the plug's answer in a terminal.

## Get Nexus

Plugins are developed inside a checkout of Nexus, because the SDK isn't published to npm yet. This
is the only way for now; when it is published, a plugin will live in a repository of its own.

You need Node.js 24 or newer (`node --version` tells you; Nexus uses the built-in `node:sqlite`).

```sh
git clone https://github.com/Multivit4min/lox-nexus.git
cd lox-nexus
npm install
npm run build
```

`npm install` links the workspaces, so your plugin will find the SDK. `npm run build` builds the web
interface once, because `npm run dev` serves the built files. It takes a minute or two and builds
this documentation and the first-party plugins as well. You do it again only after pulling new
changes.

## Start Nexus

```sh
npm run dev
```

This starts the server in watch mode on <http://localhost:8080/>. If port 8080 is taken, put
`NEXUS_HTTP_PORT=8081` (or another port, but not 8090, which the fake plug uses below) in a file called `.env` at the repository root. See
[Installation](../../guide/installation.md#run-from-source) for the other settings.

What makes it a *development* server for you:

- It runs every plugin in the `plugins/` directory **from source** (`src/index.ts`), so there is no
  build step while you work.
- It watches that directory. When you save a file, the instances of that plugin restart on the new
  code. A new plugin directory is picked up the same way.
- It keeps its data in `apps/server/data/`. Delete that directory to start over.

Open the address in your browser. The first visit shows a setup page: choose a username and a
password (at least 8 characters, typed twice). This works once; afterwards the page is a login.

You land on the **Miniservers** page, which is empty. The bar at the top has **Miniservers**,
**Plugins** and **Wires**; the menu under your user name at the top right has the **Bus Inspector**
and the **Docs**. You can read this documentation at <http://localhost:8080/docs/> too.

Open **Plugins**. The **Instances** list is empty. That is right: you haven't written anything yet.

## Start the fake plug

The plug that this tutorial talks to is a small HTTP server in the repository. Open a second
terminal in the repository and start it:

```sh
npm run fake-plug -w @lox-nexus/example-smart-plug
```

It prints:

```
Fake plug "Desk lamp" at http://127.0.0.1:8090 (GET /status, POST /switch). Ctrl+C stops it.
```

Leave it running. To use another port, add it after `--`:
`npm run fake-plug -w @lox-nexus/example-smart-plug -- 8095`. It listens on `127.0.0.1` only, so
Nexus has to run on the same machine.

Ask it how it is:

```sh
curl http://127.0.0.1:8090/status
```

```json
{"name":"Desk lamp","on":false,"power":0,"energy":0}
```

| Field | Meaning |
|---|---|
| `name` | What the plug is called. |
| `on` | Whether it is switched on. |
| `power` | What it draws now, in watts (0 while off, about 55 to 65 W while on). |
| `energy` | What it used so far, in kWh, counted while on. |

Switch it on and read it again:

```sh
curl -X POST -H 'content-type: application/json' -d '{"on": true}' http://127.0.0.1:8090/switch
curl http://127.0.0.1:8090/status
```

`on` is now `true` and `power` is around 60. Switch it off again with `{"on": false}`. That is the
whole API: your plugin will read `/status` every few seconds and post to `/switch`.

## Just see the finished plugin

If you would rather watch the end result before building it, the finished plugin runs from where
it is. Stop `npm run dev`, then start it with the `examples` directory instead of `plugins`:

```sh
NEXUS_DEV_PLUGINS_DIR=../../examples npm run dev
```

The path is relative to `apps/server`, where the server runs. Under **Plugins** ▸ **Add instance**
you can then pick **Smart plug**. The examples directory is never loaded by a plain `npm run dev`,
so it can't clash with the plugin you write. (You can also copy `examples/smart-plug` to
`plugins/smart-plug` and change its package name in `package.json` to
`@lox-nexus/plugin-smart-plug`; two workspaces with the same name make `npm install` fail.)

This runs the finished plugin under the id `smart-plug`, the same id as the plugin you are about to
write. If you add an instance from it, **delete that instance before step 2** (or delete
`apps/server/data/` to start from scratch). Otherwise it keeps its id and its topic name
`desk-lamp`, runs against your half-written plugin later, and collides with the name step 2 uses.

For the tutorial, go back to a plain `npm run dev` and continue with
[step 2](first-plugin.md).
