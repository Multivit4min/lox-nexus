# Logging, store and status

Read this when you want to show the user what your plugin does, or keep a token or a cursor across restarts.

These three are on the plugin, and sensors and actuators reach them through `this.plugin`.

## `log`

```ts
this.log.debug("polled", { ms: 42 })
this.log.info("connected")
this.log.warn("slow answer", { ms: 4200 })
this.log.error("login failed", { status: 401 })
```

Lines go to the server log tagged with the instance, and the last lines show on the instance's
page. The second argument is structured data. It is structured-cloned, so something that cannot
be cloned (a socket, a function) is logged as text, and more than 64 KiB as JSON is replaced by
a note with its size. Message text is clipped at 10 000 characters. **Never log secrets.**

Inside an actuator's `run()` a log line is linked to the command that caused it. From a sensor or
actuator use `this.plugin.log` (the plugin's `log` is public). A sensor does not know its place in
the UI, so name the signal in the message with `this.signal.label` and the params.

```ts
this.plugin.log.warn("no value", { signal: this.signal.label, path: this.params.path })
```

**Debug lines** are kept only while the user switches on **Debug for 15 min** on the instance's
page. The rest of the time `log.debug()` is dropped in the worker before anything is sent, so
log as much detail at debug as helps finding a problem. A library with its own logging can follow
the switch with `this.logLevel`:

```ts
override start() {
  const apply = (level: LogLevel) => this.client.setVerbose(level === "debug")
  apply(this.logLevel.current)
  this.onDispose(this.logLevel.onChange(apply))
}
```

## `store`

Use the store for small state that must survive a restart and a plugin update: a login token, a
"last seen" id, a cursor. It is a key-value store of JSON per instance. Reads are synchronous
and come from memory; each write is sent to the host, which saves it.

```ts
private async token(): Promise<string> {
  const saved = this.store.get<{ value: string; expires: number }>("token")
  if (saved && saved.expires > this.clock.now() + 60_000) return saved.value
  const fresh = await this.api.login(this.config.user, this.config.password)
  this.store.set("token", { value: fresh.token, expires: fresh.expires })
  return fresh.token
}
```

- `get<T>(key)` returns `undefined` for a missing key. The cast to `T` is not checked, so validate
  data an older version of your plugin may have written.
- `set(key, value)` throws an `Error` for an empty key or one over 200 characters, for `undefined`
  (use `delete()`), for what JSON cannot hold (BigInt, circular objects), and for a value over
  1 MiB as JSON. Quietly, `undefined` fields are dropped, dates become strings and class instances
  are flattened. The value you read back with `get()` is the same copy that was stored.
- `delete(key)` removes a key; an absent key is not an error. `keys()` lists what is stored.
- The store is per instance and survives restarts, updates and rollbacks of the plugin.
  Newer versions must tolerate what older ones wrote, and the other way round.
- Users see it: **Manage ▸ Stored data…** on the instance page lists every key with its size and
  shows a value on request. It can't be edited, only wiped as a whole with **Clear all data**, which stops
  a running instance, deletes every key and starts it again. So a plugin must start on an empty
  store at any time, as on its first start. Keep credentials in secret settings rather than the
  store where you can: the card shows values in plain text to everyone who can log in.

## `status`

`this.status.set("degraded", message)` and `this.status.set("running")` are the plugin's own health,
see [Starting, failing and degrading](failing.md). The message is clipped at
10 000 characters. A new run starts as `running`, so set `degraded` again after a restart if the
problem is still there.
