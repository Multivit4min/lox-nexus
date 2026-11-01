# Starting, failing and degrading

Read this when your device can be unreachable or a login can be wrong: which state to report, and what Nexus does about it.

There are three different ways to say "something is wrong", and they mean different things.

| Situation | What to do | What happens |
|---|---|---|
| The user must fix something (wrong credentials, a missing device) | Reject `start()` with a readable message | The instance goes to *error*. Nexus does **not** restart it. |
| The device is unreachable right now, but may come back | Resolve `start()`, call `this.status.set("degraded", "inverter unreachable")`, keep retrying | The instance shows as degraded with your message. |
| The device is back | `this.status.set("running")` | Back to normal. |

Status messages, errors and log lines are read by people **and by AI agents** connected over MCP.
Never put a password or token in them: Nexus replaces the stored secrets it knows with `‹secret›`
before an agent sees them (as they are, JSON-escaped, URL-encoded or whole as base64), but not ones
it doesn't know (a session token your plugin fetched), ones shorter than 6 characters, nor any
other transformation of them.

```ts
private async poll() {
  try {
    this.latest = await this.api.read()
    if (this.unreachable) {
      this.unreachable = false
      this.log.info("reading the inverter again")
      this.status.set("running")
    }
    this.emitter.emit("data", this.latest)
  } catch (error) {
    if (!this.unreachable) {
      this.unreachable = true
      this.log.warn("can't read the inverter", { problem: String(error) })
      this.status.set("degraded", `inverter unreachable: ${String(error)}`)
    }
  }
}
```

Report on **changes** as above, not on every failed poll, or you flood the log. Do not await slow
first requests in `start()` if the plugin works without them; start them in the background
(`void this.poller.poll()`) so a hanging device does not hold the start up.

A failure of one sensor, as opposed to the whole device, is reported with `fail()`, see
[Sensors](sensors.md).

**Restarts.** Nexus restarts a worker that crashed, ran out of memory (128 MB heap, or the manifest's `heapMb`), took longer
than 30 seconds to start, or stopped answering its pings (sent every 10 seconds; the worker is
terminated after three go unanswered, so after roughly 30 to 40 seconds of a busy loop). The delay
before a restart doubles each time: 1 s, 2 s, 4 s and so on up to 5 minutes. A run that stays up for
60 seconds resets the delay. After a restart your plugin starts from step 1 of the
[lifecycle](lifecycle.md).
