# SDK at a glance

This page is maintained by hand next to the generated [SDK reference](../reference/sdk/index.md); if the two ever disagree, the reference wins. For concepts see [Writing plugins](authoring.md), [Values](values.md) and [Testing](testing.md).

Imports: `@lox-nexus/plugin-sdk` (classes), `@lox-nexus/plugin-sdk/values`, `@lox-nexus/plugin-sdk/testing`, `@lox-nexus/plugin-sdk/wire`.

## `@lox-nexus/plugin-sdk`

### Plugin ([reference](../reference/sdk/@lox-nexus/plugin-sdk.md#abstract-plugin))

```ts
abstract class Plugin<Config = unknown> extends Disposable {
  constructor(protected readonly context: PluginContext)
  get config(): Config
  get log(): PluginLogger
  get store(): PluginStore
  get status(): PluginStatus
  get http(): PluginHttp
  get slug(): string | undefined
  start(): void | Promise<void>
  catalog(): CatalogNode[] | Promise<CatalogNode[]>
  panel(): Panel | undefined | Promise<Panel | undefined>
  unhandledRejection(reason: unknown): void
}
```

| Member | Notes |
|---|---|
| `start()` | Reject only for what a restart can't fix (bad credentials): the instance goes to the error state and is not restarted. For an unreachable device resolve and call `status.set("degraded", ...)`. |
| `catalog()` | Asked on demand by the UI; may query the device; a throw is shown to the user. Default `[]`. Answers (catalog, panel, webhook responses) over 16 MiB as JSON fail instead. |
| `panel()` | Asked on demand; `undefined` shows nothing. Never put secrets in it. |
| `unhandledRejection(reason)` | Called for a promise in the worker that was rejected without a handler (a forgotten `.catch`). The worker keeps running; the default logs an error with the stack. Override to say more or to set a degraded status; it must not throw. `PluginTestHost.unhandledRejection(reason)` calls it in tests. |
| `config` | Already validated against the static `config` schema, defaults applied. Available in field initializers of subclasses. |
| `slug` | The instance's slug: its topic segment and webhook path (`/hook/<slug>/…`). Undefined with hosts that don't send it. Fixed for one run (a slug change restarts the instance). |

Static declarations on the subclass ([`PluginClass`](../reference/sdk/@lox-nexus/plugin-sdk.md#pluginclass)); all optional:

```ts
static readonly config?: z.ZodType      // default: no config (empty object)
static readonly sensors?: readonly SensorClass[]      // ids unique among sensors
static readonly actuators?: readonly ActuatorClass[]  // ids unique among actuators
```

### Sensor ([reference](../reference/sdk/@lox-nexus/plugin-sdk.md#abstract-sensor))

```ts
abstract class Sensor<P extends Plugin = Plugin, Params = unknown> extends Disposable {
  constructor(readonly plugin: P, readonly params: Params, private readonly output: SensorOutput, readonly signal: SignalInfo = { id: "", label: "" })
  start(): void | Promise<void>
  protected emit(value: Value): void
  protected fail(message: string): void
  protected recover(): void
}
```

| Member | Notes |
|---|---|
| `start()` | A rejection makes adding the signal fail and disposes the sensor. |
| `emit(value)` | Sends a value to the bus; equal consecutive values are deduped there. No-op after dispose. |
| `fail(message)` | The sensor can't deliver any more; shown on the signal until the next `emit()` or `recover()`. |
| `recover()` | The failure is over although there is no value to send (an entity back as "unavailable"). Only tells the host after a `fail()`, so it is cheap to call on every change. |
| `signal` | `{ id, label }` of the configured signal this sensor is; label `""` with hosts that don't send it. |

Static declarations ([`SensorClass`](../reference/sdk/@lox-nexus/plugin-sdk.md#sensorclass)):

```ts
static readonly id: string                       // required; stored with the signal, never rename
static readonly label?: string                   // default: id
static readonly params?: z.ZodType               // default: empty object; validated before construction
static readonly valueType?: ValueType | "any"    // what emit() sends; default "any"
```

`SensorOutput`: `{ emit(value: Value): void; fail(message: string): void; recover?(): void }`, the runtime's side, not used by plugin code.

### Actuator ([reference](../reference/sdk/@lox-nexus/plugin-sdk.md#abstract-actuator))

```ts
abstract class Actuator<P extends Plugin = Plugin, Params = unknown, V extends Value = Value> extends Disposable {
  constructor(readonly plugin: P, readonly params: Params, readonly signal: SignalInfo = { id: "", label: "" })
  start(): void | Promise<void>
  abstract run(value: V): void | Promise<void>
}
```

| Member | Notes |
|---|---|
| `run(value)` | Throwing or rejecting reports a failed result. Emits and logs made while it runs (also from timers and promises it started) carry the command's cause. Never overlaps itself. |
| `start()` | A rejection makes adding the signal fail. |

Static declarations ([`ActuatorClass`](../reference/sdk/@lox-nexus/plugin-sdk.md#actuatorclass)):

```ts
static readonly id: string                          // required; stored with the signal, never rename
static readonly label?: string                      // default: id
static readonly params?: z.ZodType                  // default: empty object
static readonly accepts?: ValueType | "any"         // wires convert to this before run(); default "any"
static readonly concurrency?: ActuatorConcurrency   // "queue" (default) | "latest"
```

`"latest"`: while a command runs, only the newest waiting one runs; the replaced ones are reported as superseded ([`SupersededError`](../reference/sdk/@lox-nexus/plugin-sdk.md#supersedederror), thrown by the runtime, not by plugins).

### Disposable ([reference](../reference/sdk/@lox-nexus/plugin-sdk.md#abstract-disposable))

```ts
abstract class Disposable implements DisposableLike {
  static readonly MAX_TIMER_MS: 2_147_483_647
  get isDisposed(): boolean
  dispose(): Promise<void>
  protected onDispose(teardown: Teardown): void
  protected own<T extends DisposableLike>(resource: T): T
  protected every(ms: number, fn: () => void): () => void
  protected after(ms: number, fn: () => void): () => void
  protected listen(emitter: Listenable, event: string | symbol, listener: Listener): void
}
```

| Method | Notes |
|---|---|
| `dispose()` | Teardowns run in reverse registration order; idempotent. Throws `AggregateError` after all ran if any failed. |
| `onDispose(teardown)` | Throws `Error` if already disposed. |
| `own(resource)` | Disposes `resource` with this object; returns it. |
| `every(ms, fn)` | Returns a cancel function. Throws `RangeError` unless `0 < ms <= MAX_TIMER_MS`. |
| `after(ms, fn)` | Returns a cancel function. Throws `RangeError` for negative or non-finite `ms`; long delays are stepped. |
| `listen(emitter, event, listener)` | Subscribes until disposed. |

Related types: `Teardown = () => void | Promise<void>`, `DisposableLike { dispose(): void | Promise<void> }`, `Listenable { on(event, listener): unknown; off(event, listener): unknown }` (an `EventEmitter` fits), `Listener = (...args: any[]) => void`.

### Context objects

```ts
/** which configured signal a sensor or actuator is; label "" with hosts that don't send it */
interface SignalInfo { id: string; label: string }
interface PluginContext {
  readonly instanceId: string
  readonly slug?: string
  readonly config: unknown
  readonly log: PluginLogger
  readonly store: PluginStore
  readonly status: PluginStatus
  readonly http: PluginHttp
}
type PluginLogger = Record<"debug" | "info" | "warn" | "error", (message: string, data?: unknown) => void>
interface PluginStore {
  get<T = unknown>(key: string): T | undefined
  set(key: string, value: unknown): void
  delete(key: string): void
  keys(): string[]
}
interface PluginStatus { set(status: "running" | "degraded", message?: string): void }
interface PluginHttp { route(method: string, path: string, handler: HttpHandler): void }
type HttpHandler = (request: HttpRequest) => HttpResponse | Promise<HttpResponse>
```

| Item | Notes |
|---|---|
| `store.get` | The cast to `T` is not checked; validate data an older version wrote. |
| `store.set` | Value must be JSON; BigInt and cycles throw `Error`; keys are 1 to 200 characters, values at most 1 MiB as JSON (else `Error`). |
| `status.set` | `message` is clipped to 10 000 characters; `"running"` clears `"degraded"`. |
| `http.route` | Reachable at `/hook/<instance slug><path>` **without a login**: check a secret yourself. Method `"*"` matches any method; a path ending in `/*` matches everything below that prefix (`"/a/*"` matches `/a/` and `/a/b`, not `/a`; `"/*"` all). The most specific route wins: exact before prefix, longer prefix first, a named method before `"*"`. Throws `Error` on a duplicate method + path. A throwing handler gives the caller 502. |
| `log.*` | `data` is structured-cloned; more than 64 KiB as JSON is replaced by a note with its size. Never log secrets. |

### Entry, config and re-exports

| Export | Signature | Notes |
|---|---|---|
| [`PluginEntry`](../reference/sdk/@lox-nexus/plugin-sdk.md#pluginentry) | `static define<T extends PluginClass>(type: T): T` | `export default PluginEntry.define(MyPlugin)` in `src/index.ts`. Starts the worker runtime only when loaded by Nexus. |
| [`secret`](../reference/sdk/@lox-nexus/plugin-sdk.md#secret) | `secret<T extends z.ZodType>(schema: T): T` | Marks a field `writeOnly`: never sent back to the UI, kept when an update omits it. Top-level fields only. |
| [`code`](../reference/sdk/@lox-nexus/plugin-sdk.md#code) | `code<T extends z.ZodType>(schema: T, language?: CodeLanguage): T` | Marks a string field as source code (`format: "code"` plus the language's `contentMediaType`), so the UI edits it in a code editor. `CodeLanguage` is `"javascript"` (default), `"json"` or `"text"`. Validating the code stays the plugin's job. |
| `z` | zod | Use this one, not your own copy. |
| [`SupersededError`](../reference/sdk/@lox-nexus/plugin-sdk.md#supersedederror) | `class extends Error` | See `concurrency: "latest"`. |
| `CatalogNode`, `CatalogEntry`, `Panel`, `HttpRequest`, `HttpResponse` | types, see [wire](#lox-nexusplugin-sdkwire) | Return values of `catalog()`, `panel()` and webhook handlers. |

## `@lox-nexus/plugin-sdk/values`

### Value ([reference](../reference/sdk/@lox-nexus/plugin-sdk/values.md#valuefactory))

```ts
type Value =
  | { type: "null" }
  | { type: "boolean"; value: boolean }
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "singleChannel"; value: SingleChannel }
  | { type: "rgbw"; value: Rgbw }
  | { type: "tunableWhite"; value: TunableWhite }
  | { type: "t5"; value: T5 }
type ValueType = Value["type"]
type ValueOf<T extends ValueType> = Extract<Value, { type: T }>
interface SingleChannel { channel: number; fadeTime: number }
interface Rgbw { red: number; green: number; blue: number; white: number; fadeTime: number; flags: number }
interface TunableWhite { temperature: number; brightness: number; fadeTime: number }
interface T5 { buttons: number }
```

Units: channels and brightness 0-100 (whole percent), `fadeTime` seconds, `temperature` Kelvin (conversions keep 2700-6500), `flags` raw bits (experimental), `buttons` bitmask 0-31 (experimental).

`Value` is also an object (an instance of `ValueFactory`):

```ts
Value.null(): ValueOf<"null">
Value.boolean(value: boolean): ValueOf<"boolean">
Value.number(value: number): ValueOf<"number">
Value.string(value: string): ValueOf<"string">
Value.singleChannel(value: SingleChannel): ValueOf<"singleChannel">
Value.rgbw(value: Rgbw): ValueOf<"rgbw">
Value.tunableWhite(value: TunableWhite): ValueOf<"tunableWhite">
Value.t5(value: T5): ValueOf<"t5">
Value.isType(type: string): type is ValueType
Value.equals(a: Value | undefined, b: Value | undefined): boolean
Value.types: readonly ValueType[]
```

| Gotcha | |
|---|---|
| Structured factories | Round to whole percent (clamped 0-100) and 0.1 s fades; `t5` masks outside 0-31 become 0. They don't validate. |
| `equals` | Structural; `NaN` equals `NaN`, `0` equals `-0`. |

### Conversion and helpers ([reference](../reference/sdk/@lox-nexus/plugin-sdk/values.md))

| Export | Signature | Notes |
|---|---|---|
| [`Converter`](../reference/sdk/@lox-nexus/plugin-sdk/values.md#converter) | `static convert<T extends ValueType>(value: Value, to: T): ValueOf<T>` | Never throws; impossible conversions give the target's default. Same-type input is returned as is. |
| [`ValueDefaults`](../reference/sdk/@lox-nexus/plugin-sdk/values.md#valuedefaults) | `static for<T extends ValueType>(type: T): ValueOf<T>`; `FADE_TIME = 0.2` (s); `TEMPERATURE = 4000` (K) | A fresh default value per call. |
| [`ValueSchema`](../reference/sdk/@lox-nexus/plugin-sdk/values.md#valueschema) | `z.ZodType<Value>` | Validates untrusted values; accepts only what a Miniserver can carry. |
| `ValueTypeSchema` | `z.enum([...ValueType])` | |
| [`ValueFormatter`](../reference/sdk/@lox-nexus/plugin-sdk/values.md#valueformatter) | `new ValueFormatter().format(value: Value \| undefined): string` | Display only, lossy; never parse it. |
| [`StringToNumber`](../reference/sdk/@lox-nexus/plugin-sdk/values.md#stringtonumber) | `new StringToNumber().parse(input: string): number` | Lenient: `"20%"` gives 0.2, `"1.234,5"` gives 1234.5, unparseable gives 0. |
| [`T5Buttons`](../reference/sdk/@lox-nexus/plugin-sdk/values.md#t5buttons) | `new T5Buttons(mask)`; `isPressed(button): boolean`; `names(): string[]`; `toString(): string`; constants `LEFT_UPPER=1 RIGHT_UPPER=2 MIDDLE=4 LEFT_LOWER=8 RIGHT_LOWER=16` | Experimental. |
| [`Numbers`](../reference/sdk/@lox-nexus/plugin-sdk/values.md#numbers) | `clamp(value, min, max, fallback = min)`, `percent(value, fallback = 0)`, `fade(seconds)`, `scale(value, min, max, toMin, toMax)`, `percentToHex(value)` (all static) | `percent` rounds and clamps to 0-100; `fade` limits to 0-6553.5 s in 0.1 s steps; `scale` with an empty source range gives `toMin`. |

## `@lox-nexus/plugin-sdk/testing`

### PluginTestHost ([reference](../reference/sdk/@lox-nexus/plugin-sdk/testing.md#plugintesthost))

```ts
class PluginTestHost {
  readonly sent: WorkerMessage[]
  readonly store: Record<string, unknown>
  static start(type: PluginClass, options?: TestHostOptions): Promise<PluginTestHost>
  static describe(type: PluginClass): Promise<PluginDescription>
  addSensor(capability: string, params?: unknown, label?: string): Promise<string>
  addActuator(capability: string, params?: unknown, label?: string): Promise<string>
  remove(id: string): Promise<void>
  values(id: string): Value[]
  next(id: string, timeoutMs?: number): Promise<Value>
  actuate(id: string, value: Value, causeId?: string): Promise<void>
  catalog(): Promise<CatalogNode[]>
  panel(): Promise<Panel | undefined>
  http(request: Partial<HttpRequest> & Pick<HttpRequest, "path">): Promise<Required<HttpResponse>>
  get status(): { status: "running" | "degraded"; message?: string }
  stop(): Promise<void>
}
interface TestHostOptions { config?: unknown; store?: Record<string, unknown>; instanceId?: string; slug?: string /* default "test" */ }
```

| Member | Notes |
|---|---|
| `start` | Defaults: `config` `{}`, `store` `{}`, `instanceId` `"test"`. Throws `Error` with the plugin's message when init fails (invalid config, `start()` threw). |
| `addSensor` / `addActuator` | Return the new signal's id. Throw for unknown capabilities, invalid params or a failing `start()`. |
| `values(id)` | Every value emitted so far. |
| `next(id, timeoutMs = 2000)` | Waits for the next value emitted after the call; throws on timeout. |
| `actuate` | Throws `Error` with the message `run()` threw. `causeId` is the bus message it answers. |
| `http` | Method defaults to `POST`; unknown route answers 404; a throwing handler rejects. |
| `status` | Last reported status, `running` if none. |
| `sent` | Everything the plugin sent, structured-cloned like the worker boundary. |

`PluginRuntimeForTests` is internal (its constructor may change); don't use it.

## `@lox-nexus/plugin-sdk/wire`

Plugin authors need only the shapes ([reference](../reference/sdk/@lox-nexus/plugin-sdk/wire.md)):

```ts
interface CatalogNode { label: string; children?: CatalogNode[]; entries?: CatalogEntry[] }
type CatalogEntry = { kind: "sensor" | "actuator"; capability: string; params: unknown; label: string; value?: Value; unit?: string }
type Panel =
  | { type: "keyValue"; items: { label: string; value: string }[] }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "json"; data: unknown }
type HttpRequest = { method: string; path: string; query: Record<string, string>; headers: Record<string, string>; body: string }
type HttpResponse = { status: number; headers?: Record<string, string>; body?: string }
type PluginHealth = "running" | "degraded"
type LogLevel = "debug" | "info" | "warn" | "error"
```

| Item | Notes |
|---|---|
| `CatalogEntry.params` | Validated against the capability's `params` schema when the user adds it. |
| `HttpRequest` | `path` is below `/hook/<instance>`; repeated query keys and headers are joined with `", "`; header names lowercase; the session cookie is not forwarded; `body` is utf-8 text. |
| `HttpResponse` | `status` 100-599; `body` is utf-8 text. |
| `Panel` cells | Strings only; format numbers yourself. |

For hosts and tools: `WIRE_VERSION` (1), `HostMessageSchema`, `WorkerMessageSchema`, `SignalSpecSchema`, `HttpRequestSchema`, `HttpResponseSchema`, `CatalogEntrySchema`, `CatalogNodeSchema`, `PanelSchema`, `CapabilityDescriptionSchema`, `PluginDescriptionSchema`, `PluginHealthSchema`, `LogLevelSchema`, the matching types (`HostMessage`, `WorkerMessage`, `SignalSpec`, `CapabilityDescription`, `PluginDescription`, `JsonSchema`) and `PluginWorkerData`.
