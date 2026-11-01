# Config: what the user fills in

Read this when you add a field to the form the user fills in, test the connection, or change the settings' shape in a later release.

The instance config is a zod schema. Nexus turns it into a form, so the choices you make in the
schema decide what the user sees.

```ts
const config = z.object({
  host: z.url().meta({ title: "Inverter address", description: "e.g. http://192.168.1.50" }),
  mode: z.enum(["current", "next"]).meta({ enumLabels: { current: "The active event", next: "The next event" } }),
  pollInterval: z.number().min(1).default(5)
})
```

- **Labels.** A field is labelled with its `title` and explained by its `description`
  (`.meta({ title: "Variable", description: "…" })`). Without a title the key is used (`entityId`
  becomes "Entity ID"). Prefer a title when the key is a generic word such as `name`, which the
  user would confuse with the signal's own name.
- **Choices.** An `z.enum` shows its values unless you name them with `enumLabels` as above.
- **`this.config`** has defaults applied and is available in field initializers.
- **Use the SDK's `z`.** Import it from `@lox-nexus/plugin-sdk` so your schemas and the runtime
  share one zod version.
- **Keep schemas simple**: strings, numbers, booleans, enums, optional fields and defaults, and
  arrays and objects of those (a list of devices, each with a name and a type, renders as a list
  the user adds rows to). The
  form is built from the JSON Schema, so transforms and refinements are lost there, while the worker
  still enforces them when it starts. An object-level `.refine()` or `.superRefine()` keeps the form
  the same; the form does not run the check, and the worker refuses a failing value at start (the
  instance goes to *error* with your message). The same holds for params.

## Checking, testing and migrating settings

Nexus asks the plugin to check settings before it saves them: your `config` schema runs in a
throwaway worker, and its issues show in the form by field. The plugin doesn't start for that.

`static test(config)` adds **Test connection** to the form. It gets a valid config, reaches the
device or service, and resolves with a short message, or throws with one the user can act on.
Only read: never write, never change anything on the device.

```ts
static async test(config: Config) {
  const info = await new Client(config.host).version()
  return `Connected to ${info.model} at ${config.host}`
}
```

When a release changes the shape of the config, raise `static configVersion` (default 1) and
give `static migrateConfig({ config, from, store })`. It gets the stored config of version
`from` (not validated) and returns the current shape; it may move data into the store. Nexus
stores the result with the new version. It runs when an instance starts, and when its settings
are saved before that, on a copy of its store whose writes Nexus applies.

**Make it safe to run again on the same data.** Older hosts don't store the result, so it runs at
every start with `from: 1`, also on a config already in the current shape; and a start that
fails after migrating repeats it. Take `from` as a lower bound, keep current fields that are
already there, and never overwrite what the store already holds:

```ts
static readonly configVersion = 2
static migrateConfig({ config, from, store }: ConfigMigration) {
  if (from >= 2) return config
  const { devices, ...rest } = config as { devices?: unknown }
  // only once: later, the store's list is the plugin's own and may have changed
  if (devices && store.get("devices") === undefined) store.set("devices", devices)
  return rest
}
```

In tests, `PluginTestHost.checkConfig(type, config, version?)` and `testConfig(type, config)`
run these without starting the plugin, and `start(type, { config, configVersion })` with
`host.migratedConfig` shows what init migrated.

## Fields that depend on a choice

A `z.discriminatedUnion` shows as a choice of its discriminator followed by the chosen branch's
fields, in settings, params and action forms. A literal names its value with `.meta({ title })`;
an enum branch names its values with `enumLabels`, and its title and description are the choice's:

```ts
const input = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["light", "plug"]).meta({ title: "Type", enumLabels: { light: "Light", plug: "Plug" } }), name: z.string() }),
  z.object({ type: z.literal("door-lock").meta({ title: "Door lock" }), name: z.string(), allowUnlock: z.boolean().default(false) })
])
```

**Allow unlocking** shows only while Door lock is chosen; fields both branches have keep what was
typed when the choice changes. Other unions are edited as JSON.

## Helpers that change how a field is shown

All of these wrap a zod schema, return it unchanged in type, and only add a marker to the JSON
Schema.

**`secret(schema)`** is for passwords and tokens. The value is never sent back to the UI, and an
update that leaves it out keeps the stored value.

```ts
token: secret(z.string())
```

Only **top-level** fields are protected. A secret inside a nested object or an array is shown in the
UI, and saving the form erases it. `secret()` survives `.optional()`, `.default()` and
`.describe()` in any order, but keep the field at the top level of the object.

**`token(schema)`** is for a string that callers present to you, such as a webhook token. The form
shows a **Generate** button that fills in 24 random bytes as 48 hex characters, so the schema must
allow that length. Leave it visible so the user can copy it into the caller, or wrap it in
`secret()` as well to hide it.

```ts
token: token(z.string().min(16).optional())
```

**`signalName(schema)`** goes on the one top-level *param* of a sensor or actuator whose value
names the signal, such as a hook or variable name. The form names a new signal after what is typed
there (and its topic after that name) until the user names it. Without one, a new signal is named
after its kind ("Trigger (pulse)"), which says little once there are several.

```ts
static readonly params = z.object({ hook: signalName(z.string().min(1)) })
```

**Field kinds.** These build a schema with its own input in the form; hosts and UIs that don't know
the hint still show and check a number or text:

| Helper | Value | The form shows |
|---|---|---|
| `duration({ unit, min, max })` | a number of `unit`s (`"ms"`, `"s"` default, `"min"`, `"h"`) | a number with a unit to pick; the value stays in the field's unit |
| `timeOfDay()` | `"HH:MM"` | a time picker |
| `color()` | `"#rrggbb"` | a colour picker with the hex next to it |
| `slider(min, max, step)` | a number in the range | a slider with the number |
| `file({ accept, maxBytes, encoding })` | the file's contents, text or base64 | a file picker; the size is checked before upload |
| an array of an enum, `z.array(z.enum([...]))` | the picked values | chips to toggle |

```ts
pollEvery: duration({ unit: "s", min: 5 }).default(60),
quietFrom: timeOfDay().optional(),
certificate: secret(file({ accept: ".pem,.crt" }).optional())
```

**`discoverable(schema)`** gives a top-level field a **Find** button, see
[Find on the network](#find-on-the-network).

**`code(schema, language?)`** is for source code or a template. The UI edits it in a code editor.
`language` is `"javascript"` (default), `"json"` or `"text"`. The SDK does not validate the code:
compile or parse it in `start()` and throw with the line and column.

```ts
script: code(z.string().default("return input"), "javascript")
```

## Find on the network

A config field marked with `discoverable()` gets a **Find** button. It runs the plugin's
`static discover(field, config)` in a throwaway worker (like Test connection, without starting the
plugin, for at most 15 seconds) and offers what it found; the user picks one and the field gets
its `value`. `config` is the form as filled in so far, not validated. Most devices that announce
themselves do it with mDNS, which `Mdns.browse` asks:

```ts
static readonly config = z.object({ url: discoverable(z.url().meta({ title: "URL" })) })

static async discover() {
  const servers = await Mdns.browse("_home-assistant._tcp.local")
  return servers.map(server => ({
    label: server.name.split("._")[0] ?? server.host,
    value: server.txt.base_url ?? `http://${server.addresses[0] ?? server.host}:${server.port}`,
    detail: server.host
  }))
}
```

`Mdns.browse` asks once from a random port and collects answers for 3 seconds (`timeoutMs`), so it
needs neither port 5353 nor a running mDNS daemon. It only finds devices on the same network as
Nexus (in Docker: host networking). Read, never write: Find may run while the user is still typing.
