# InfluxDB plugin

Writes the values of signals to **InfluxDB** (1, 2 or 3), for Grafana dashboards and long-term
storage. Any signal of Nexus can be exported: Loxone inputs and outputs, other plugins' sensors and
actuators.

**You choose the signals on the instance's page** (*Exported signals*): all of them, whole
Miniservers or plugin instances, or single signals. The config below only says *where and how* to
write. Until you choose, nothing is written.

The plugin has no sensors, actuators or catalog. It is an exporter: values go out, nothing comes
back to Loxone.

## Config

| Field (form label) | Default | |
|---|---|---|
| `url` (*URL*) | required | The InfluxDB server, e.g. `http://influx.local:8086`. http or https; a path is kept as a prefix (`https://proxy/influx`). No user or password in the URL. |
| `api` (*API*) | `v2` | *InfluxDB 2 or 3 (token)* (`v2`) or *InfluxDB 1 (user and password)* (`v1`). InfluxDB 3 accepts the version 2 write API with the database as bucket. |
| `org` (*Organization*) | | v2: required. The organization's name or ID. InfluxDB 3 ignores it; enter any name. |
| `bucket` (*Bucket*) | | v2: required. On InfluxDB 3 the database. |
| `token` (*API token*) | | v2: required, **secret**. A token with write access to the bucket. Visible ASCII characters only, no spaces. |
| `database` (*Database*) | | v1: required. |
| `retentionPolicy` (*Retention policy*) | the database's default | v1 only. |
| `username` (*User*) | none | v1 only; leave empty when authentication is off. Visible ASCII characters, no spaces or colons. |
| `password` (*Password*) | | v1 only, **secret**. |
| `measurement` (*Measurement*) | `lox_nexus` | All points go to this measurement. Must not start with `#` (a comment in line protocol). |
| `tagTopic` (*Tag: topic*) | on | Add the tag `topic`. |
| `tagLabel` (*Tag: name*) | on | Add the tag `label`. |
| `tagOwner` (*Tag: owner*) | on | Add the tag `owner`. |
| `flushSeconds` (*Write interval (s)*) | `5` | 1 to 3600. Values are collected and written at least this often. |
| `batchSize` (*Batch size*) | `5000` | 1 to 10 000 points per request. A full batch is written right away. At most the buffer size. |
| `maxBufferedPoints` (*Buffer (points)*) | `25000` | 100 to 50 000. Points kept while InfluxDB is unreachable; beyond that the oldest are dropped. |
| `writeInitial` (*Write initial values*) | on | Also write the current value each signal has when watching starts (after a start, or when you choose a signal). Off: only changes. |
| `gzip` (*Compress (gzip)*) | on | Send requests gzip-compressed. |

Text fields are trimmed. The fields of the chosen API are checked when the instance starts; a
missing one puts the instance into the error state with a message naming it.

At start the plugin also asks InfluxDB's `/health` (v2 and 3) or `/ping` (v1) once, in the
background. When that fails (wrong URL, server down) the instance shows *degraded* with the reason
right away instead of with the first values; the first successful write clears it. The check
doesn't test the credentials or the bucket: the first write does.

## Data model

One measurement (`lox_nexus` by default), one point per value, timestamped with the time the value
was on the bus (millisecond precision).

**Tags**

| Tag | Always | Example |
|---|---|---|
| `signal_id` | yes | `4f9c2a1e-…`: stable, survives renames. Filter by this in dashboards that must not break. |
| `value_type` | yes | `number`, `boolean`, `string`, `t5`, `singleChannel`, `tunableWhite`, `rgbw` (the value's own type) |
| `topic` | `tagTopic` | `loxone/home/in/temperature`. Changes when the signal or its owner is renamed. |
| `label` | `tagLabel` | `Living room temperature`, the signal's name. Changes when it is renamed. |
| `owner` | `tagOwner` | `miniserver:<id>` or `plugin:<id>`, the Miniserver or plugin instance it belongs to |

Tags with an empty value are left out (line protocol can't carry them). In the measurement and in
tags, backslashes, commas, spaces and (in tags) equal signs are escaped, and control characters
(line breaks, tabs) become spaces. String fields keep everything; quotes and backslashes are
escaped.

**Fields** are fixed per value type, so one field name always has one type. Two signals, or a signal
whose type changes, can never cause a *field type conflict* in InfluxDB:

| Value type | Fields (all floats unless noted) |
|---|---|
| `number` | `value` |
| `boolean` | `value`: 0 or 1 |
| `t5` | `value`: the buttons bitmask |
| `string` | `text` (string) |
| `singleChannel` | `brightness`, `fade_time` |
| `tunableWhite` | `brightness`, `temperature`, `fade_time` |
| `rgbw` | `red`, `green`, `blue`, `white`, `fade_time` |
| `null` | no point |

A **forced** value (set by hand in Nexus, not sent by the device or Miniserver) also gets the
boolean field `forced=true`. Commands sent to actuators are written like states.

Example lines:

```
lox_nexus,label=Living\ room,owner=miniserver:ms1,signal_id=t1,topic=loxone/home/in/temperature,value_type=number value=21.5 1793606400000
lox_nexus,label=Kitchen\ light,owner=plugin:hue,signal_id=l1,topic=hue/bridge/actuator/kitchen,value_type=rgbw red=100,green=50,blue=0,white=10,fade_time=1 1793606400500
```

## Grafana

**InfluxDB 2 (Flux)**, by signal id (stable) or by name:

```flux
from(bucket: "loxone")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r._measurement == "lox_nexus" and r._field == "value")
  |> filter(fn: (r) => r.signal_id == "4f9c2a1e-…")   // or: r.label == "Living room temperature"
  |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)
  |> keep(columns: ["_time", "_value", "label"])
```

**InfluxDB 1 (InfluxQL)**:

```sql
SELECT mean("value") FROM "lox_nexus"
WHERE "label" = 'Living room temperature' AND $timeFilter
GROUP BY time($__interval), "label" fill(none)
```

For an on/off signal use `last("value")` or `max("value")` instead of `mean`. To see every signal
of a Miniserver: `WHERE "owner" = 'miniserver:<id>'`, grouped by `"label"`. InfluxDB 3 takes SQL or
InfluxQL in Grafana; the InfluxQL query above works there too.

## Writing and retries

Values are buffered in memory and written in batches, one request at a time: every
`flushSeconds`, and right away when `batchSize` points are waiting. Receiving values never waits for
InfluxDB, so a slow or unreachable server doesn't slow Nexus down.

| InfluxDB answers | What happens |
|---|---|
| `204` (any 2xx) | written; a degraded status is cleared |
| `429` | normal throttling, the status stays *running*: the batch is sent again when `Retry-After` says (1 s to 10 min), else after 1 s, 2 s, 4 s … up to 60 s |
| `503` with `Retry-After` | status *degraded*; the batch is sent again when the server asks (1 s to 10 min) |
| other `5xx`, `408`, network error, timeout (15 s) | status *degraded*; the batch is kept and sent again after 1 s, 2 s, 4 s … up to 60 s |
| `413` | status *degraded*: "batch too large; lower the batch size". The batch is split in half and sent again at once; batches stay at most that size until the instance restarts. A single point that is still too large is rejected. |
| `400` and other `4xx` (`422`: older than the retention period) | the data itself is wrong: the batch is **dropped** and counted as rejected, the reason (the start of InfluxDB's answer, at most 500 characters) is logged at most once a minute, and writing goes on. The server answered, so a degraded status is cleared. |
| `401`, `403` | status *degraded*: "unauthorized". Points keep being buffered; tried again every 60 s. |
| `404` | status *degraded*: "bucket or database not found"; as above |
| `3xx` | status *degraded*: the URL redirects; set the URL to the new address. Redirects are never followed, so a token never goes to another address. |

While a batch is retried nothing else is sent, so points arrive in order. After an outage the
backlog is sent batch after batch without waiting for the interval. A failure is logged when its
reason changes, not on every retry.

On **stop** the plugin waits for a running request, then sends what is left batch by batch until a
write fails, all within 1.5 seconds. Failures during the stop don't change the status. What is
still unwritten then is lost, and the log says how many points.

**Partial writes.** InfluxDB 2 writes the valid lines of a batch it answers `400` to and refuses the
rest. The plugin can't tell which, so it counts the whole batch as rejected. The fixed field types
per value type make such answers rare.

## Limits

- **The buffer is in memory** and bounded by `maxBufferedPoints` and by 32 million characters
  of line protocol, whichever comes first. When it is full the oldest waiting points are dropped
  and counted (*Dropped (buffer full)* in the panel, and a warning in the log at most once a
  minute). A typical line (UUID tags, a topic and a name) is about 250 characters and takes about
  280 bytes of memory (more with non-Latin characters in names, which double a line's size). The
  worker has a 128 MB heap, which is why the buffer is capped at 50 000 points. Nothing is kept
  across restarts.
- If the plugin itself falls behind, Nexus drops the oldest values before delivering them; these
  are counted as *Dropped by Nexus*. Mapping and buffering are fast, so this should not happen.
- Integers are written as floats: one `value` field for all numeric types avoids type conflicts.
- RGBW `flags` are not written.
- Points of the same signal with the same millisecond overwrite each other in InfluxDB.
- Values of a signal that isn't in the watch list are skipped (Nexus doesn't send such values;
  this is a safeguard).

## Panel

Two sections. **Export**: the state (`ok`, or what is being retried and when), the target (URL and
bucket or database, never the token or password), how many signals are watched, the last success,
the last error and the last request's latency. **Points**: written, buffered (of the capacity),
dropped because the buffer was full, dropped by Nexus, rejected by InfluxDB, and skipped (null
values, unknown signals). The counters live in memory and start at zero with every start.

## Security

- The **token** and **password** are secret config fields: never sent back to the UI, never logged,
  never in the panel. The v1 password goes in a basic auth header, not in the URL, where it would
  end up in access logs. Tokens and user names a header can't carry are refused by the config
  check, and errors from building a request are reported in fixed words, never with the request's
  headers.
- **Redirects are never followed**, so the token is never sent to another address. Response bodies
  are read only up to 4 KB.
- Use **https** when InfluxDB is not on the same host; the token travels with every request.
- Give the token **write access to one bucket only**.
- **This plugin sees the values of other systems**: whatever signals you choose, for example alarm
  states or presence, and writes them to InfluxDB. Choose only what you want stored there, and
  protect the database like the data in it. Secrets never travel on the bus.

## Development

```
npm test                                       # from the repo root; tests live next to the code in src/
npm run build -w @lox-nexus/plugin-influxdb    # dist/plugin.js, one ESM bundle (esbuild)
```

Tests run against a fake InfluxDB (`src/test-support/FakeInflux.ts`, node:http on 127.0.0.1) that
records the requests and answers from a script; no real server is contacted.
