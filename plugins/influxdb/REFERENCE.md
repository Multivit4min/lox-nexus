## Choosing the signals

The plugin is an exporter. Which signals it writes is chosen on the instance's page under
*Exported signals*: all of them, whole Miniservers or plugin instances, or single signals. The
config only says *where and how* to write. Until you choose, nothing is written.

## Config details

- `org`, `bucket`, `token`, `database`, `retentionPolicy` and `username` are trimmed; `password`
  and `measurement` are taken as entered. Text fields take at most 200 characters, the token and
  the password at most 1000.
- The fields the chosen API needs are checked with the config: with `v2` **Organization**,
  **Bucket** and **API token**, with `v1` **Database**. A missing one fails the start with
  `invalid config: …` and a message such as *Organization is required for InfluxDB 2 or 3
  (token)*. **Batch size** larger than **Buffer (points)** is refused the same way.
- A query string or `#…` in the URL is ignored; a path is kept as a prefix.
- Tokens and user names a header can't carry (spaces, line breaks, non-ASCII characters) are
  refused by the config check. A user name must not contain a colon, since basic auth splits
  user and password at the first one.

## Requests

| API | Write | Health check | Auth |
|---|---|---|---|
| `v2` (InfluxDB 2 and 3) | `POST <url>/api/v2/write?org=…&bucket=…&precision=ms` | `GET <url>/health` | `Authorization: Token …` |
| `v1` | `POST <url>/write?db=…&rp=…&precision=ms` (`rp` only when set) | `GET <url>/ping` | basic auth, only when a user is set |

The body is line protocol (`text/plain; charset=utf-8`), gzip-compressed unless **Compress
(gzip)** is off. Every request times out after 15 seconds.

At start the plugin asks the health endpoint once, in the background. When that fails (wrong URL,
server down, an answer of 300 or above) and nothing was written yet, the instance shows
*degraded* with the reason right away instead of with the first values; the next answered write
clears it. The check doesn't test the credentials or the bucket: the first write does.

## Data model

One measurement (`lox_nexus` by default), one point per value, timestamped with the time the value
was on the bus (millisecond precision).

**Tags** (sorted by key, as InfluxDB recommends)

| Tag | Always | Example |
|---|---|---|
| `signal_id` | yes | `4f9c2a1e-…`: stable, survives renames. Filter by this in dashboards that must not break. |
| `value_type` | yes | `number`, `boolean`, `string`, `t5`, `singleChannel`, `tunableWhite`, `rgbw` (the value's own type) |
| `topic` | with `tagTopic` | `loxone/home/in/temperature`. Changes when the signal or its owner is renamed. |
| `label` | with `tagLabel` | `Living room temperature`, the signal's name. Changes when it is renamed. |
| `owner` | with `tagOwner` | `miniserver:<id>` or `plugin:<id>`, the Miniserver or plugin instance it belongs to; left out for a signal without owner |

**Fields** are fixed per value type, so one field name always has one type. Two signals, or a
signal whose type changes, can never cause a *field type conflict* in InfluxDB:

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

**Initial values.** When watching starts, and later for each signal you add to the choice, Nexus
first sends the current value of that signal (actuators have one only when forced). With **Write initial values** off these are left
out silently; only the changes after them are written.

## Line protocol

- In the measurement, tag keys, tag values and field keys, backslashes, commas and spaces are
  escaped, and equal signs too except in the measurement. Control characters (line breaks, tabs)
  become spaces there, since line protocol can't escape them.
- Tags with an empty value are left out (line protocol can't carry them).
- String fields keep everything, line breaks included; quotes and backslashes are escaped.
- Numbers are written without the `i` suffix, so they are floats. `NaN` and `Infinity` can't be
  written: such a field is left out, and a point left without fields is skipped.

Example lines:

```
lox_nexus,label=Living\ room,owner=miniserver:ms1,signal_id=t1,topic=loxone/home/in/temperature,value_type=number value=21.5 1793606400000
lox_nexus,label=Kitchen\ light,owner=plugin:hue,signal_id=l1,topic=hue/bridge/actuator/kitchen,value_type=rgbw red=100,green=50,blue=0,white=10,fade_time=1 1793606400500
```

## Writing and retries

Values are buffered in memory and written in batches, one request at a time: every
`flushSeconds`, and right away when `batchSize` points are waiting. Receiving values never waits
for InfluxDB, so a slow or unreachable server doesn't slow Nexus down.

| InfluxDB answers | What happens |
|---|---|
| `204` (any 2xx) | written; a degraded status is cleared |
| `429` | normal throttling, not degraded: the batch is sent again when `Retry-After` says (1 s to 10 min), else after 1 s, 2 s, 4 s … up to 60 s |
| `503` with `Retry-After` | status *degraded*; the batch is sent again when the server asks (1 s to 10 min) |
| other `5xx`, `408`, network error, timeout (15 s) | status *degraded*; the batch is kept and sent again after 1 s, 2 s, 4 s … up to 60 s |
| `413` | status *degraded*: "batch too large (HTTP 413); lower the batch size". The batch is split in half and sent again at once; batches stay at most that size until the instance restarts. A single point that is still too large is rejected. |
| `400` and other `4xx` (`422`: a field type conflict, or older than the retention period) | the data itself is wrong: the batch is **dropped** and counted as rejected, the reason (the start of InfluxDB's answer, at most 500 characters) is logged at most once a minute, and writing goes on. The server answered, so a degraded status is cleared. |
| `401`, `403` | status *degraded*: "unauthorized", naming the token or the user and password to check. Points keep being buffered; tried again every 60 s. |
| `404` | status *degraded*: "bucket or database not found"; as above |
| `3xx` | status *degraded*: the URL redirects (the message names the new address); set the URL to it. Redirects are never followed, so a token never goes to another address. As above. |

While a batch is retried nothing else is sent, so points arrive in order. After an outage the
backlog is sent full batch after full batch without waiting for the interval; a last, smaller
batch goes with the next interval. A failure is logged when its reason changes, not on every
retry, and *InfluxDB answers again* once it does.

On **stop** the plugin waits for a running request, then sends what is left batch by batch until a
write fails, all within 1.5 seconds. Failures during the stop don't change the status. What is
still unwritten then is lost, and the log says how many points.

**Partial writes.** InfluxDB may store the valid lines of a batch it answers `400` or `422` to.
When the answer says how many points were dropped (`partial write: … dropped=N`, or InfluxDB 3's
JSON list of failed lines), only those count as rejected and the rest as written. An answer that
doesn't say, or whose count lies beyond the 500 characters kept, counts the whole batch as
rejected. The fixed field types per value type make such answers rare.

## Panel

Two sections. The counters live in memory and start at
zero with every start.

- **Export:** *State* (`waiting for values`, `ok`, `ok, the last batch was rejected`, or what is
  being retried and when), *Target* (the URL with org and bucket, or database, retention policy
  and user; never the token or password), *Watched signals* (`none chosen yet` until you choose),
  *Last success*, *Last error* (time and reason) and *Last latency*.
- **Points:** *Written*, *Buffered* (of the capacity), *Dropped (buffer full)*, *Dropped by Nexus
  (export behind)*, *Rejected by InfluxDB*, and *Skipped (null or unknown signal)*, which also
  counts points without a writable field.

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

## Limits

- **The buffer is in memory** and bounded by `maxBufferedPoints` and by 32 million characters of
  line protocol, whichever comes first. When it is full the oldest waiting points are dropped and
  counted (*Dropped (buffer full)* in the panel, and a warning in the log at most once a minute).
  A batch being sent or retried is never dropped. A typical line (UUID tags, a topic and a name)
  is about 250 characters and takes about 280 bytes of memory (more with non-Latin characters in
  names, which double a line's size). The worker has a 128 MB heap, which is why the buffer is
  capped at 50 000 points. Nothing is kept across restarts.
- If the plugin itself falls behind, Nexus drops the oldest values before delivering them; these
  are counted as *Dropped by Nexus* and warned about like a full buffer. Mapping and buffering are
  fast, so this should not happen.
- Integers are written as floats: one `value` field for all numeric types avoids type conflicts.
- RGBW `flags` are not written.
- Points of the same signal with the same millisecond overwrite each other in InfluxDB.
- Values of a signal that isn't in the watch list are skipped (Nexus doesn't send such values;
  this is a safeguard).

## Security

- The **token** and **password** are secret config fields: never sent back to the UI, never
  logged, never in the panel. The v1 password goes in a basic auth header, not in the URL, where
  it would end up in access logs. Errors from building a request are reported in fixed words,
  never with the request's headers.
- **Redirects are never followed**, so the token is never sent to another address. Response
  bodies are read only up to 4 KB, and at most 500 characters of them are kept for messages.
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
