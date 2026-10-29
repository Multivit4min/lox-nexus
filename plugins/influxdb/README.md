# InfluxDB plugin

Writes the values of Nexus signals to InfluxDB 1, 2 or 3, for Grafana dashboards and long-term
storage. Values only go out: nothing comes back to Nexus or Loxone.

## What it does

- **Panel:** the export's state, its target, the last success and error, and counters of
  written, buffered, dropped, rejected and skipped points.
- **Export:** writes every value of the signals you choose under *Exported signals* on the
  instance's page (Loxone inputs and outputs, other plugins' sensors and actuators) as one point
  in one measurement, tagged with the signal's id, type, topic, name and owner.

## Before you start

- An InfluxDB server Nexus can reach over http or https: InfluxDB 2 or 3 (they use the version 2
  write API) or InfluxDB 1.
- InfluxDB 2: the organization, a bucket and an API token with write access to that bucket.
  InfluxDB 3: the database and a token that may write to it.
- InfluxDB 1: the database, and a user and password if authentication is on.
- After saving the instance, choose the signals under *Exported signals*. Until you do, nothing is
  written.

## Configuration

| Field | | Description |
|---|---|---|
| **URL** (`url`) | required | Address of the InfluxDB server, http or https, e.g. `http://influx.local:8086`. A path is kept as a prefix (`https://proxy.local/influx`). No user or password in the URL. |
| **API** (`api`) | optional; default `v2` | *InfluxDB 2 or 3 (token)* (`v2`) or *InfluxDB 1 (user and password)* (`v1`). Choose `v2` for InfluxDB 3 too. |
| **Organization** (`org`) | required with `v2` | The organization's name or ID, e.g. `home`. InfluxDB 3 ignores it; enter any name. |
| **Bucket** (`bucket`) | required with `v2` | The bucket, e.g. `loxone`. On InfluxDB 3 the database. |
| **API token** (`token`) | required with `v2`; secret | A token allowed to write to the bucket. Visible ASCII characters only, no spaces. |
| **Database** (`database`) | required with `v1` | The InfluxDB 1 database, e.g. `loxone`. |
| **Retention policy** (`retentionPolicy`) | optional | InfluxDB 1 only. Leave empty for the database's default, e.g. `autogen`. |
| **User** (`username`) | optional | InfluxDB 1 only. Leave empty when authentication is off. Visible ASCII characters, no spaces or colons. |
| **Password** (`password`) | optional; secret | InfluxDB 1 only: the user's password. Ignored without a user. |
| **Measurement** (`measurement`) | optional; default `lox_nexus` | All points go to this measurement; signals are told apart by tags. Must not start with `#`. |
| **Tag: topic** (`tagTopic`) | optional; default on | Add the signal's bus topic as tag `topic`, e.g. `loxone/home/in/temperature`. |
| **Tag: name** (`tagLabel`) | optional; default on | Add the signal's name as tag `label`, e.g. `Living room temperature`. |
| **Tag: owner** (`tagOwner`) | optional; default on | Add the Miniserver or plugin instance as tag `owner` (`miniserver:<id>` or `plugin:<id>`). |
| **Write interval (s)** (`flushSeconds`) | optional; default `5` | 1 to 3600. Values are collected and written at least this often. |
| **Batch size** (`batchSize`) | optional; default `5000` | 1 to 10 000 points per request; a full batch is written right away. Not more than the buffer. |
| **Buffer (points)** (`maxBufferedPoints`) | optional; default `25000` | 100 to 50 000. Points kept while InfluxDB is unreachable; beyond that the oldest are dropped. |
| **Write initial values** (`writeInitial`) | optional; default on | Also write the current value Nexus sends when watching starts and when you add a signal to the choice. Off: only changes. |
| **Compress (gzip)** (`gzip`) | optional; default on | Send requests gzip-compressed. Turn off only for a server or proxy that can't take it. |

A missing field of the chosen API stops the instance from starting, with a message naming it.

## Sensors and actuators

The plugin has no sensors, actuators or catalog: it only exports the signals you choose.

## Good to know

- Filter dashboards by the tag `signal_id`: it survives renames, while `label` and `topic` change
  when a signal or its owner is renamed.
- The buffer is in memory. While InfluxDB is down, points are kept up to **Buffer (points)**, then
  the oldest are dropped; whatever is unwritten at a stop or restart is lost.
- A wrong URL or a stopped server shows as *degraded* shortly after the start. Wrong credentials
  or a missing bucket show with the first write; points stay buffered and the write is tried
  again every minute.
- Data InfluxDB refuses (for example older than the retention period) is dropped, counted as
  rejected in the panel and logged at most once a minute; writing goes on.
- The plugin sees whatever you choose, alarm states or presence included, and stores it in
  InfluxDB. Use https when InfluxDB is on another host, and give the token write access to one
  bucket only.

## More

The full reference (data model and fields per value type, line protocol, batching and retries,
the panel, Grafana queries, limits, security and development) is in `REFERENCE.md` next to this
file, and on the plugin's page in the Nexus documentation.
