# Webhooks

Read this when the other system pushes to you instead of you asking it.

Use a webhook when an external system should push to your plugin instead of you polling it.

```ts
import { timingSafeEqual } from "node:crypto"

override start() {
  this.http.route("POST", "/github", request => {
    if (!this.authentic(request.headers["x-hook-secret"])) return { status: 401 }
    this.events.push(JSON.parse(request.body))
    return { status: 204 }
  })
}

/** compares in constant time, so the answer's timing doesn't reveal how much of a guess was right */
private authentic(given: string | undefined) {
  const expected = Buffer.from(this.config.hookSecret)
  const actual = Buffer.from(given ?? "")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
```

(`hookSecret` is a `secret(z.string())` field of your config.)

**Webhooks are reachable without a login.** Anyone who can reach Nexus can call them, so check a
shared secret yourself, as above.

- **URL.** The route is `/hook/<instance slug><path>`, for example `/hook/demo/github`. Register
  routes in `start()`. Registering the same method and path twice throws an `Error`.
- **Matching.** A method of `"*"` matches any method. A path ending in `/*` matches everything
  below it (`/a/*` matches `/a/` and `/a/b`, not `/a`; `"/*"` everything), for names the user
  chooses at run time; the handler reads `request.path`. The most specific route wins: exact
  before prefix, longer prefix first, a named method before `"*"`. The
  [webhook plugin](../webhook.md) is a full example with one catch-all route.
- **Request.** `method`, `path` (below `/hook/<slug>`), `query`, `headers` and `body`. Header names
  are lowercase, repeated headers and query keys are joined with `, `, and the session cookie is
  not forwarded. `body` is utf-8 text, so parse JSON or form data yourself.
- **Answer.** Return `{ status, headers?, body? }` (or a promise of it). `status` is 100 to 599;
  `headers` and `body` default to empty. The answer is sent with a restrictive content security
  policy, and you cannot set cookies.
- **Failures.** A handler that throws, or returns something that is not a valid response, gives the
  caller **502** and writes the error to the server log; the caller does not see your message. An
  unknown route gives 404. Calls are limited to 8 in flight per instance (429 beyond that), and a
  handler has 30 seconds. While the plugin is not running the caller gets 503.
