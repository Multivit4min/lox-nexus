## URLs

Every hook of an instance is reachable at

```
https://<nexus>/hook/<instance slug>/<hook name>
```

`<instance slug>` is the slug you gave the instance; `<hook name>` is the `hook` param of its
signals. Hook names are lowercase letters, digits, `.`, `_` and `-`, start with a letter or digit,
and are at most 64 characters (`doorbell`, `pv.export`, `garage-door_2`). A trailing slash is
ignored; a deeper path (`/hook/home/doorbell/extra`) names no hook and is answered `404`.

Several signals may share a hook name: one call then reaches all of them, for example a trigger
plus a value from the same body. A hook exists while at least one signal uses it.

The plugin has no catalog: hook names are yours to choose, there is nothing to browse. It has no
connection to keep either, so with a token set it is always **running**.

## Authentication

A call is accepted when it carries the instance token in any of these places. The **body is never
read for the token**: a token only in the body is answered `401`.

| Where | Example |
|---|---|
| `Authorization` header, Bearer scheme (`Bearer` in any case) | `Authorization: Bearer 3f6c…` |
| `X-Webhook-Token` header (surrounding spaces are ignored) | `X-Webhook-Token: 3f6c…` |
| `token` query parameter | `…/hook/home/doorbell?token=3f6c…` |

If a call carries the token in more than one place, it is accepted when any of them matches. An
empty value counts as no token. A repeated query parameter (`?token=a&token=b`) reaches the plugin
as one joined value and so doesn't match.

The query parameter exists because many devices and services can only be given a URL. Prefer a
header where you can: **URLs, with their query, end up in the access logs of proxies and web
servers** and in the caller's own logs and history.

When the token is changed and saved, callers with the old one are refused from then on.

## Answers

Checked in this order:

| Status | When |
|---|---|
| `401` + `WWW-Authenticate: Bearer` | the token is missing or wrong. Checked first, so a caller without the token can't find out which hooks exist: unknown hooks answer `401` too. |
| `404` | no signal uses this hook name |
| `405` + `Allow` | none of the hook's signals accepts the method (`Allow` lists the methods they do accept) |
| `400` + reasons (text, one per line) | a value couldn't be read: the body isn't JSON, the path or field is missing, or the value doesn't fit the sensor's type. Triggers, and value signals that could read their value, still fire. |
| `204` | every signal handled the call (no body) |

Nexus itself answers `429` when the instance already has 8 calls in flight, and `503` while the
instance isn't running.

Reasons in a `400` name the source, for example `json outdoor.temp: "abc" is not a number`,
`JSON path "outdoor.temp" not found`, `query parameter "percent" is missing`,
`form field "armed" is missing` or `the body is not valid JSON`.

The body may be at most 1 MiB (enforced by Nexus). Bodies are parsed by content type: an
`application/x-www-form-urlencoded` body is form data and an `application/json` or `…+json` body
is JSON; a JSON source refuses form data and a form source refuses JSON. A body without a content
type, or with another one such as `text/plain`, is read as whatever the signal expects, because
many devices send JSON without saying so.

## Sensors

All sensors take `hook` (*Hook name* in the form) and `method` (*HTTP method*): `any`
(*Any method*), `GET`, `POST` or `PUT`.

A new sensor is named after its hook as you type it, so its topic is the hook name too
(`webhook/<instance>/sensor/motion-entrance`); a second sensor on the same hook gets `-2`. Type a
name of your own to change that.

### `trigger`: a pulse per call (value type `boolean`)

Params: `{ hook, method = "any", pulseMs = 1000 }`, `pulseMs` (*Pulse length (ms)*) a whole
number from 50 to 3 600 000.

Starts `false`. A call emits `true`, and `false` follows `pulseMs` after the **last** call: a call
during the pulse extends it. Wire it to a Loxone digital input to start a block on a call.

### `number`, `text`, `switch`: a value from the call

Params: `{ hook, method = "POST", source = "json", path?, name? }`. The form calls them
*Value from*, *JSON path* and *Field name*; the choices of `source` are named in the table.

| `source` | Reads | Needs |
|---|---|---|
| `json` (*JSON body*) | a value in the JSON body | `path`, e.g. `temp`, `rooms[1].temp`, `data.items.0.state` |
| `query` (*Query parameter*) | a query parameter | `name`, 1 to 100 characters (not `token`, which carries the secret) |
| `form` (*Form field*) | a field of a form-urlencoded body | `name`, 1 to 100 characters |
| `body` (*Whole body*) | the whole body text | |

The value is emitted as it is and stays until the next call changes it. Each sensor converts to
its type and refuses (`400`) what doesn't fit, instead of sending a made-up 0 or false:

| Sensor | Value type | Accepts |
|---|---|---|
| `number` | `number` | JSON numbers; text like `21.5`, `-3`, `+4`, `1e3`, `.5`, `21,5` (decimal comma); `true`/`false` as 1/0. Not empty text, or text too large for a number (`1e999`). |
| `text` | `string` | text; numbers and booleans written out; objects and arrays as their JSON text. Not `null`, and at most 4096 characters (one value travels to the bus, the recorder and the Miniserver). |
| `switch` | `boolean` | JSON booleans; numbers (non-zero is on); `true`/`false`, `on`/`off`, `yes`/`no`, `1`/`0` in any case |

`number` and `switch` ignore spaces around text (`" 21.5 "` is `21.5`).

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

Three sections.

- **Token**: the token and where callers put it (`Authorization: Bearer …`, `X-Webhook-Token: …`,
  or in the URL as `/hook/<instance slug>/<hook>?token=…`), and that a token in the body is not
  read. Without a token, the warning instead.
- **Hooks**: a table with a row per hook: its name, URL (`/hook/<instance slug>/<name>`), the
  methods and the signals using it (by their names, with what they read, e.g.
  `"Doorbell": trigger, 1000 ms pulse` or `"Outdoor": number from json outdoor.temp`), the number
  of calls, the time of the last call and its result (`ok`, `method … not allowed`,
  `bad request: <reason>`). Calls without a valid token never change a hook's row, so a caller who
  guesses a name can't hide the real calls.
- **Refused calls**: those that didn't reach a hook: wrong or missing tokens (`401`, with the
  split) and unknown hook names (`404`), each with the time of the last one.

The counters live in memory and start at zero with every start of the instance. Times are shown in
UTC (ISO 8601).

## Security notes

- Webhook URLs are reachable **without a Nexus login**; the token is the only protection. Use a
  long random token (the form's **Generate** button) and HTTPS in front of Nexus. Without a token
  there is no protection at all: the instance runs as *degraded* with that warning, logs it at
  start, and the panel says so too.
- The token is compared in constant time: both sides are hashed with SHA-256 and compared with
  `timingSafeEqual`, so neither the content nor the length of the token leaks through timing.
- The token is a plain config field, not a secret one: it is visible in the instance form, the
  panel and the config export to whoever is logged in to Nexus, since the caller has to keep it in
  plain text anyway. It is never logged.
- Calls with a wrong or missing token are logged at `warn`: the first right away, then at most one
  line a minute with the count, so a brute force can't flood the log. The status stays as it is.
  The line says whether the hook exists, never the path, which may hold a token typed into it by
  mistake (`/hook/home/door&token=…`).
- A `query` source can't read the `token` parameter, so a signal can't publish the token on the
  bus.
- Prefer headers over the `token` query parameter (see Authentication above).
- Nexus limits a plugin instance to 8 calls in flight (`429` beyond that).

## Fixed compared to the old integration

1. A JSON value was overwritten with `false` right after it was set (a reset timer with an
   undefined duration). Values now stay.
2. Overlapping calls each started their own reset timer, so a second call within the pulse was cut
   short by the first call's timer, and timers survived the variable's removal. Now each trigger
   has one timer that a call restarts, and removing the signal clears it.
3. A wrong or missing token, and any error, were answered `200`. Now `401`, `404`, `405` and `400`
   tell the caller what went wrong.
4. The token was compared with `===` and stored as a plain parameter per variable. Now there is
   one token per instance, compared in constant time.
5. Every call wrote its counter and time to the database. Counters are now in memory.

Also new: query, form and raw-body sources, typed number/text/switch sensors with strict
conversion, the `X-Webhook-Token` header and `token` query parameter, and method filters with
`405`.

## Known limitations

- One token per instance; there are no per-hook tokens. Use several instances to separate callers.
- No request signatures (e.g. GitHub's or Stripe's HMAC headers); the token is a bearer secret.
- The panel shows the path of each hook, not the full URL: the plugin doesn't know the address
  under which callers reach Nexus.
- Responses carry no body on success, so callers that expect `200 OK` with content may complain
  about `204`.

## Development

```
npm test                                      # from the repo root; tests live next to the code in src/
npm run build -w @lox-nexus/plugin-webhook    # dist/plugin.js, one ESM bundle (esbuild)
```
