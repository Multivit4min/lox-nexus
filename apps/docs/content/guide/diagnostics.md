# System diagnostics

Nexus watches its own resources: memory, CPU, the event loop, each plugin's worker, bus and
Miniserver traffic, and disk use. The **System** page shows them. It is meant for checking a long
run, such as a 24-hour soak test, or for finding out what a slow or growing installation is doing.

Open it from the menu under your user name, at the top right: **System**. Its address is
`http://<nexus>:8080/#/system`.

## What it shows

- **Figures right now**: RSS, heap, event-loop delay (p99 and max), CPU, bus messages per second,
  the plugin workers and their heap, disk use, and the open live connections.
- **Does memory stay flat?** A verdict for the heap and RSS of Nexus and the heap of every plugin
  worker: *flat*, *growing* or *shrinking*, with the rate in MiB per hour. It needs 10 minutes of
  warm-up and then an hour of samples. A heap saws up and down as garbage is collected, so the
  verdict looks at the lowest value of every complete 10 minutes and fits a line through those.
  It counts as flat while a day at that rate would add less than 5% of the heap (at least 2 MiB).
  After a gap, such as a plugin that restarted, the warm-up applies again.
- **Over time**: charts for 1, 6, 24 or 48 hours. Hover a chart, or focus it and use the arrow
  keys, to read the values of one sample.

| Chart | Lines |
|---|---|
| Memory of the Nexus process | RSS, heap total, heap used |
| Event loop delay | how late the event loop was, p50, p99 and max per sample (about 0 when idle); delays above a few tens of milliseconds mean something blocks Nexus |
| CPU and event loop use | CPU in percent of one core (all threads, plugins included), and how busy the main event loop was |
| Bus messages | messages per second on the bus |
| Plugin worker heaps | one line per running plugin instance (up to eight; the CSV has all) |
| Miniserver traffic | intercommunication messages per second per Miniserver, both directions |
| Storage | the database, the history database (write-ahead logs included) and the installed plugins |

**Download samples (CSV)** saves every sample as a table, one row per sample and a column per
figure, plugin and Miniserver, for a spreadsheet or to attach to a bug report.

## How it is measured

Nexus takes a sample every **30 seconds**, the first one 30 seconds after it starts, and keeps
**48 hours** of them **in memory** (about 6 MB). Nothing is written to disk, and a restart
(including the one after restoring a backup) starts afresh: the page shows when Nexus started, so a
restart during a test is easy to spot. A sample that couldn't be taken, or a time the process
stalled, shows as a gap in the lines. A plugin that doesn't answer within 5 seconds is left out of
that sample. Over long ranges the lines show the average per point of the chart, except p99 and
max of the event loop delay, which show the highest value, so a single stall stays visible. A stall
that starts within a moment of a sample being taken may be missed.

The same data is available as JSON from `GET /api/diagnostics` (`?since=<epoch ms>` for only newer
samples) and as CSV from `GET /api/diagnostics/samples.csv`, both with a logged-in session.

## Running a soak test

1. Set Nexus up as it will run: Miniservers, plugins, wires and history recording.
2. Restart it, so the samples cover the whole run from a clean start.
3. Let it run for 24 hours with normal traffic.
4. Open **System**: every line under *Does memory stay flat?* should say *flat*, and the event
   loop delay should stay low. Download the CSV to keep the result.

A plugin marked *growing* holds on to memory over time. Its worker has its own heap limit, and a
worker that reaches it is restarted with an "out of memory" error on its instance page.
