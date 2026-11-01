# Limits at a glance

Look here for a number (a time, a size) or for the short list of rules.

Everything numeric in one place. Keep these in mind and you will rarely meet the error messages.

| What | Limit |
|---|---|
| Time for the worker to announce itself | 10 s |
| Time for `start()` of the plugin | 30 s (then the worker is restarted) |
| Time for a signal's `start()`, a command, `catalog()`, `panel()`, a webhook answer | 30 s each |
| Ping interval and tolerated misses | every 10 s, terminated after 3 unanswered |
| Time to stop (watched batch, disposals, flush) | 5 s |
| Restart delay after a crash | 1 s, doubling to 5 min; reset after 60 s of running |
| Heap of the worker | 128 MB, or the manifest's `heapMb` (128 to 512); `process.env` is empty |
| Store key, store value | 1 to 200 characters, 1 MiB as JSON |
| Log text, log data | 10 000 characters, 64 KiB as JSON |
| Status message | 10 000 characters |
| Answer of `catalog()`, `panel()` or a webhook | 16 MiB as JSON |
| Panel sections, catalog unit | 20, 32 characters |
| Webhook calls in flight per instance | 8 (429 beyond) |
| Body of a webhook call | 1 MiB (the server answers 413 beyond) |
| Watch batch, queue | 1000 values, 20 000 values |

## Rules

- Depend only on `@lox-nexus/plugin-sdk` and your own npm packages. No native modules (see
  [Publishing](../publishing.md#what-may-be-bundled)).
- Register every timer, listener and connection through `every()`, `after()`, `listen()` and
  `own()`.
- Never log secrets or put them in a panel. Wrap secret config fields in `secret()`.
- Do not rename capability ids or change param meanings between versions without a migration
  plan: they are stored with every configured signal.
- Read what older versions stored (config and store) and tolerate what newer versions add, so
  updates and rollbacks keep working.
