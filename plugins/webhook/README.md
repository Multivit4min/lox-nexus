# Webhook plugin

Lets other systems push to Loxone over plain HTTP: a doorbell, a NAS, a weather station, an
automation service, a script with `curl`. Each call to a hook can fire a short **pulse** (a
trigger) and hand **values** from the call to the bus (a number, a text, an on/off state), read
from the JSON body, a query parameter, a form field or the raw body.

The plugin has no actuators, no catalog (hook names are yours to choose, there is nothing to
browse) and no connection to keep, so it is always **running**.

## URLs

Every hook of an instance is reachable at

```
https://<nexus>/hook/<instance slug>/<hook name>
```

`<instance slug>` is the slug you gave the instance; `<hook name>` is the `hook` param of its
signals. Hook names are lowercase letters, digits, `.`, `_` and `-`, start with a letter or digit,
and are at most 64 characters (`doorbell`, `pv.export`, `garage-door_2`). A trailing slash is
ignored.

Several signals may share a hook name: one call then reaches all of them, for example a trigger
plus a value from the same body. A hook exists while at least one signal uses it.

## Config

| Field | | |
|---|---|---|
| `token` | required, secret, 16 to 512 visible ASCII characters (no spaces) | The shared secret every call must carry. Generate one with `openssl rand -hex 24`. |

One token per instance. Different callers that shouldn't share a secret get their own instance.

## Authentication

A call is accepted when it carries the token in any of these places:

| Where | Example |
|---|---|
| `Authorization` header, Bearer scheme | `Authorization: Bearer 3f6c…` |
| `X-Webhook-Token` header | `X-Webhook-Token: 3f6c…` |
| `token` query parameter | `…/hook/home/doorbell?token=3f6c…` |

The query parameter exists because many devices and services can only be given a URL. Prefer a
header where you can: **URLs, with their query, end up in the access logs of proxies and web
servers** and in the caller's own logs and history.

## Answers

Checked in this order:

| Status | When |
|---|---|
| `401` + `WWW-Authenticate: Bearer` | the token is missing or wrong. Checked first, so a caller without the token can't find out which hooks exist: unknown hooks answer 401 too. |
| `404` | no signal uses this hook name |
| `405` + `Allow` | none of the hook's signals accepts the method (`Allow` lists the methods they do accept) |
| `400` + reasons (text, one per line) | a value couldn't be read: the body isn't JSON, the path or field is missing, or the value doesn't fit the sensor's type. Triggers, and value signals that could read their value, still fire. |
| `204` | every signal handled the call |

The body may be at most 1 MiB (enforced by Nexus). Bodies are parsed by content type: an
`application/x-www-form-urlencoded` body is form data and a `…/json` body is JSON. A body without
a content type, or with another one such as `text/plain`, is read as whatever the signal expects,
because many devices send JSON without saying so.

## Sensors

All sensors take `hook` (the hook name) and `method`: `any`, `GET`, `POST` or `PUT`.

### `trigger`: a pulse per call (value type `boolean`)

Params: `{ hook, method = "any", pulseMs = 1000 }`, `pulseMs` from 50 to 3 600 000.

Starts `false`. A call emits `true`, and `false` follows `pulseMs` after the **last** call: a call
during the pulse extends it. Wire it to a Loxone digital input to start a block on a call.

### `number`, `text`, `switch`: a value from the call

Params: `{ hook, method = "POST", source = "json", path?, name? }`

| `source` | Reads | Needs |
|---|---|---|
| `json` | a value in the JSON body | `path`, e.g. `temp`, `rooms[1].temp`, `data.items.0.state` |
| `query` | a query parameter | `name` (not `token`, which carries the secret) |
| `form` | a field of a form-urlencoded body | `name` |
| `body` | the whole body text | |

The value is emitted as it is and stays until the next call changes it. Each sensor converts to
its type and refuses (400) what doesn't fit, instead of sending a made-up 0 or false:

| Sensor | Value type | Accepts |
|---|---|---|
| `number` | `number` | JSON numbers; text like `21.5`, `-3`, `1e3`, `.5`, `21,5` (decimal comma); `true`/`false` as 1/0 |
| `text` | `string` | text; numbers and booleans written out; objects and arrays as their JSON text. Not `null`, and at most 4096 characters (one value travels to the bus, the recorder and the Miniserver). |
| `switch` | `boolean` | JSON booleans; numbers (non-zero is on); `true`/`false`, `on`/`off`, `yes`/`no`, `1`/`0` in any case |

**JSON paths** are names separated by dots and array indexes in brackets: `a.b[0].c`. A number as a
name also indexes an array (`items.0`). Names may contain anything except `.`, `[` and `]`. Only
the object's own keys are followed, and `__proto__`, `constructor` and `prototype` are refused when
the signal is added. Paths are at most 200 characters.

## Examples

With an instance `home` and the token in `$TOKEN`:

```sh
# a trigger on "doorbell" (method any)
curl -X POST -H "Authorization: Bearer $TOKEN" https://nexus.example/hook/home/doorbell

# the same from a device that only takes a URL
curl "https://nexus.example/hook/home/doorbell?token=$TOKEN"

# number sensor { hook: "weather", source: "json", path: "outdoor.temp" }
curl -H "X-Webhook-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"outdoor":{"temp":21.5,"humidity":48}}' https://nexus.example/hook/home/weather

# switch sensor { hook: "alarm", source: "form", name: "armed" }
curl -H "Authorization: Bearer $TOKEN" -d "armed=on" https://nexus.example/hook/home/alarm

# number sensor { hook: "level", method: "GET", source: "query", name: "percent" }
curl -H "Authorization: Bearer $TOKEN" "https://nexus.example/hook/home/level?percent=72"

# text sensor { hook: "message", method: "PUT", source: "body" }
curl -X PUT -H "Authorization: Bearer $TOKEN" --data-binary "Garage left open" https://nexus.example/hook/home/message
```

## Panel

One table with a row per hook: its name, URL (`/hook/<slug>/<name>`: the plugin doesn't know its
instance's slug), the methods and signals using it, the number of calls, the time of the last call
and its result (`ok`, `method … not allowed`, `bad request: <reason>`). Calls without a valid
token never change a hook's row, so a caller who guesses a name can't hide the real calls. Two
more rows count calls refused before reaching a hook: wrong or missing tokens (with the split),
and unknown hook names.

The counters live in memory and start at zero with every start of the instance.

## Security notes

- Webhook URLs are reachable **without a Nexus login**; the token is the only protection. Use a
  long random token (`openssl rand -hex 24`) and HTTPS in front of Nexus.
- The token is compared in constant time: both sides are hashed with SHA-256 and compared with
  `timingSafeEqual`, so neither the content nor the length of the token leaks through timing.
- The token is a secret config field: it isn't sent back to the UI, isn't logged and never shows in
  the panel.
- Calls with a wrong or missing token are logged at `warn`: the first right away, then at most one
  line a minute with the count, so a brute force can't flood the log. The status stays running.
  The line says whether the hook exists, never the path, which may hold a token typed into it by
  mistake (`/hook/home/door&token=…`).
- Prefer headers over the `token` query parameter (see [Authentication](#authentication)).
- Nexus limits a plugin instance to 8 calls in flight (429 beyond that).

## Fixed compared to the old integration

1. A JSON value was overwritten with `false` right after it was set (a reset timer with an
   undefined duration). Values now stay.
2. Overlapping calls each started their own reset timer, so a second call within the pulse was cut
   short by the first call's timer, and timers survived the variable's removal. Now each trigger
   has one timer that a call restarts, and removing the signal clears it.
3. A wrong or missing token, and any error, were answered 200. Now 401, 404, 405 and 400 tell the
   caller what went wrong.
4. The token was compared with `===` and stored as a plain parameter per variable, visible in the
   UI and API and exported with the config. Now there is one secret token per instance, compared in
   constant time.
5. Every call wrote its counter and time to the database. Counters are now in memory.

Also new: query, form and raw-body sources, typed number/text/switch sensors with strict
conversion, the `X-Webhook-Token` header and `token` query parameter, and method filters with 405.

## Known limitations

- One token per instance; there are no per-hook tokens. Use several instances to separate callers.
- No request signatures (e.g. GitHub's or Stripe's HMAC headers); the token is a bearer secret.
- The panel can't show the full URL, because a plugin doesn't learn its instance's slug.
- Responses carry no body on success, so callers that expect `200 OK` with content may complain
  about `204`.

## Development

```
npm test                                      # from the repo root; tests live next to the code in src/
npm run build -w @lox-nexus/plugin-webhook    # dist/plugin.js, one ESM bundle (esbuild)
```
