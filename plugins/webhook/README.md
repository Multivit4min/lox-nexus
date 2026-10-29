# Webhook plugin

Lets other systems push to Loxone over plain HTTP: a doorbell, a NAS, a weather station, an
automation service or a script with `curl` calls a URL on Nexus. Each call can fire a short pulse
and hand values from the call to the bus. Values only flow in; the plugin sends nothing back.

## What it does

- **Sensors:** a pulse for each call to a hook, and a number, text or on/off value read from the
  call (JSON body, query parameter, form field or the whole body).
- **Panel:** the token and how callers send it, a row per hook with its signals, call count and
  last result, and the calls that were refused.

## Before you start

- A caller that can make an HTTP request to Nexus: `GET`, `POST` or `PUT` to
  `https://<nexus>/hook/<instance slug>/<hook name>`, with the token in a header or in the URL.
- Network access from the caller to Nexus. Hook URLs need no Nexus login, so put HTTPS in front of
  Nexus when callers reach it over a network you don't trust.
- A hook name for each thing that calls: lowercase letters, digits, `.`, `_` and `-`, up to 64
  characters, e.g. `doorbell` or `pv.export`. You choose it in the signal; there is nothing to
  browse.

## Configuration

| Field | | Description |
|---|---|---|
| **Token** (`token`) | optional; no default; not secret (shown in the form and the panel for copying) | The shared token every call must carry. 16 to 512 visible ASCII characters, no spaces. **Generate** next to the field fills in a random one (48 hex characters, e.g. `3f6c0a…`); save to use it. Empty: every call is accepted. One token per instance; callers that shouldn't share one get their own instance. |

## Sensors and actuators

| Kind | Name (id) | Value | What it is |
|---|---|---|---|
| sensor | Trigger (pulse) (`trigger`) | boolean | `true` for each call, `false` again `pulseMs` (default 1000 ms) after the last call |
| sensor | Number (`number`) | number | A number from each call, e.g. a temperature in a JSON body |
| sensor | Text (`text`) | string | A text from each call, up to 4096 characters |
| sensor | Switch (on/off) (`switch`) | boolean | An on/off state from each call (`true`/`false`, `on`/`off`, `yes`/`no`, `1`/`0`) |

The plugin has no actuators and no catalog.

## Good to know

- **Where the token goes:** the `Authorization: Bearer <token>` header, the
  `X-Webhook-Token: <token>` header, or `?token=<token>` in the URL for callers that can only be
  given a URL. The body is never read for it: a token only in the body is answered `401`. Prefer a
  header, because URLs end up in the logs of proxies and of the caller.
- **No token means no protection:** anyone who can reach Nexus can trigger the hooks and set their
  values. The instance then shows *degraded* with that warning. Only leave it empty on a network
  where every device is trusted.
- Signals with the same hook name share each call, e.g. a trigger and a value from the same body.
  A hook exists while at least one signal uses it; other names answer `404`.
- A value that can't be read (missing field, not a number) is answered `400` with the reason;
  it is never turned into `0` or `false`. Values stay until the next call changes them.
- A trigger on hook `doorbell` of the instance `home`:

  ```sh
  curl -X POST -H "Authorization: Bearer $TOKEN" https://nexus.example/hook/home/doorbell
  ```

## More

The full reference (URLs and hook names, authentication, answers and status codes, the params and
value sources of every sensor, more `curl` examples, the panel, security notes, what was fixed
compared to the old integration, and limits) is in `REFERENCE.md` next to this file, and on the
plugin's page in the Nexus documentation.
