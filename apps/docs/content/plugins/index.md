# Writing plugins

A plugin connects one kind of external system to Nexus. It is a TypeScript package that depends
only on the public SDK, `@lox-nexus/plugin-sdk`. Each configured instance of it runs in its own
worker thread; Nexus talks to it only through messages, so a plugin can crash, hang or leak
without taking anything else down.

A plugin declares:

- **sensors**: values coming from the device (they become wire sources),
- **actuators**: commands going to the device (they become wire targets),
- optionally a **catalog** (a tree of ready-to-add sensors and actuators) and a **panel** (a
  status view).

Look at the [Fronius plugin](fronius.md) for a complete, small example (read-only, polling), and the
[Home Assistant plugin](homeassistant.md) for one with a persistent connection and actuators.

> **Today** you build and run plugins inside a Nexus checkout. Installing from a ZIP or git URL and the
> published SDK package are not available yet, see [Publishing a plugin](publishing.md).

## Quick start

This builds a plugin called *Hello* with a counter sensor and an echo actuator, and runs it.

### 1. Create the package

Inside a checkout of Nexus (after `npm install`), create `plugins/hello/`. Every directory of
`plugins/` is a workspace package.

`plugins/hello/package.json`:

```json
{
  "name": "@lox-nexus/plugin-hello",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "loxNexus": {
    "apiVersion": 1,
    "id": "hello",
    "entry": "dist/plugin.js",
    "name": "Hello",
    "icon": "hand"
  },
  "scripts": {
    "build": "esbuild src/index.ts --bundle --platform=node --format=esm --target=node24 --conditions=@lox-nexus/source --outfile=dist/plugin.js"
  },
  "dependencies": {
    "@lox-nexus/plugin-sdk": "*"
  },
  "devDependencies": {
    "esbuild": "^0.28.2"
  }
}
```

`plugins/hello/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Run `npm install` at the repository root once so the workspace picks the new package up.

### 2. Write the plugin

`plugins/hello/src/HelloPlugin.ts`:

```ts
import { Actuator, Plugin, Sensor, z } from "@lox-nexus/plugin-sdk"
import { Value, type ValueOf } from "@lox-nexus/plugin-sdk/values"

const config = z.object({
  /** seconds between two counter values */
  interval: z.number().min(1).default(5)
})

/** Emits 1, 2, 3, ... every `interval` seconds. */
class CounterSensor extends Sensor<HelloPlugin, { start: number }> {
  static readonly id = "counter"
  static readonly label = "Counter"
  static readonly description = "Counts up every interval"
  static readonly params = z.object({ start: z.number().default(0) })
  static readonly valueType = "number"

  override start() {
    let count = this.params.start
    this.every(this.plugin.config.interval * 1000, () => this.emit(Value.number(++count)))
  }
}

/** Writes whatever text it receives to the log and remembers it. */
class EchoActuator extends Actuator<HelloPlugin, Record<string, never>, ValueOf<"string">> {
  static readonly id = "echo"
  static readonly accepts = "string"

  run(value: ValueOf<"string">) {
    this.plugin.log.info("received", { text: value.value })
    this.plugin.store.set("last", value.value)
  }
}

export class HelloPlugin extends Plugin<z.infer<typeof config>> {
  static readonly config = config
  static readonly sensors = [CounterSensor]
  static readonly actuators = [EchoActuator]
}
```

`plugins/hello/src/index.ts`:

```ts
import { PluginEntry } from "@lox-nexus/plugin-sdk"
import { HelloPlugin } from "./HelloPlugin.ts"

export default PluginEntry.define(HelloPlugin)
```

Things to notice:

- `static id` is stored with every signal you configure. **Never rename it** later.
- `accepts = "string"` means a wire converts whatever arrives (a number, a boolean) to a string
  before `run()` is called.
- `this.every()` registers the timer with the sensor's lifetime: removing the signal or stopping
  the plugin stops it. Never call `setInterval` directly.

### 3. Test it

`plugins/hello/src/HelloPlugin.test.ts`:

```ts
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { HelloPlugin } from "./HelloPlugin.ts"

test("the counter counts up", async () => {
  mock.timers.enable({ apis: ["setInterval"] })
  const host = await PluginTestHost.start(HelloPlugin, { config: { interval: 5 } })
  try {
    const counter = await host.addSensor("counter", { start: 10 })
    mock.timers.tick(5000)
    assert.deepEqual(host.values(counter), [Value.number(11)])
  } finally {
    await host.stop()
    mock.timers.reset()
  }
})

test("the echo actuator stores the last text", async () => {
  const host = await PluginTestHost.start(HelloPlugin)
  try {
    const echo = await host.addActuator("echo")
    await host.actuate(echo, Value.number(42))
    assert.equal(host.store["last"], "42")
  } finally {
    await host.stop()
  }
})
```

Run it with `npm test` from the repository root (it picks up `plugins/*/src/**/*.test.ts`).

### 4. Run it

```sh
npm run dev
```

`npm run dev` loads every directory of `plugins/` from source and restarts a plugin's instances
when its files change. Open the **Plugins** page, add an instance of *Hello* (slug `demo`), then add
a *Counter* sensor. Its topic is `hello/demo/sensor/<name>`. Watch it in the **Bus Inspector**, or
wire it to a Miniserver output.

### 5. Build it

```sh
npm run build -w @lox-nexus/plugin-hello
```

This writes one self-contained file, `dist/plugin.js`, which is what a release ships. See
[Publishing a plugin](publishing.md).

## Next

- [Plugin guide](authoring.md): every part of the SDK in context.
- [SDK at a glance](sdk-at-a-glance.md): all signatures on one page.
- [Values](values.md), [Testing](testing.md), [Publishing](publishing.md).
