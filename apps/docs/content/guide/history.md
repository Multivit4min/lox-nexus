# History

Nexus can keep the past values of signals and show them as a chart. The **History** page sets what
is recorded and how long it is kept; the chart button at the end of every signal row shows a
signal's values.

## What is recorded

Nothing, until you choose. Two ways:

- **Selected signals** (the default): only what you switch on. Open a signal's chart and switch on
  *Record this signal*, or tick several signals in a list and press **Record**. Under
  *Exceptions* on the History page you can also take every signal of a Miniserver or plugin
  instance at once.
- **All signals**: everything, except what you switch off. This grows fastest; the History page
  shows an estimate first.

A setting on a single signal beats one on its Miniserver or plugin instance, which beats the
choice above. So "all signals, but not this Miniserver, except this one signal of it" works.
Recording can be switched off as a whole with *Record history*.

What is recorded: the values a signal shows, including forced ones (marked as forced), and
commands to actuators. A value replayed after a restart isn't recorded twice.

## How long it is kept

Every value is kept in three levels of detail:

| Level | Default | Used for |
|---|---|---|
| every change | 7 days | charts of the last days |
| 5-minute averages, with the lowest and highest value | 90 days | weeks and months |
| hourly averages, with the lowest and highest value | 2 years | months and years |

0 keeps a level forever. Older data is deleted bit by bit, every minute. Averages are weighted by
time: a light that was on for 6 of 24 hours averages 25 %, and a temperature that changes in bursts
isn't skewed towards the bursts.

*Changes closer than* (1000 ms by default) keeps only the latest of quick changes one by one; the
averages still see every change.

## Charts

The chart button opens a signal's history for the last hour, day, week, month or year. Nexus picks
the detail that fits: every change for short ranges, 5-minute or hourly averages (as a line with a
band from lowest to highest) for long ones. A value holds until it changes, so the line is a
staircase. Grey areas are times nothing was recorded: Nexus wasn't running, or the signal's
recording was switched off. Nothing is known about the value then. Text values are shown as a list
of changes. *Delete history* removes what is stored for the signal.

## Where it is stored

In `history.db` in the data directory, next to the configuration but separate from it, so it can
be left out of a backup or deleted on its own. If it is ever damaged, Nexus moves it aside
(`history.db.broken-<time>`) and starts a new one. When a signal is deleted, its history goes an
hour later; a configuration import that recreates the signal keeps it, and the choice of what is
recorded is part of the configuration export.

How much it takes depends on how often values change. A typical installation, where most values
change a few times an hour, needs a few MB a year. 500 signals that change every 10 seconds need
about 130 MB a day with all signals recorded. The History page shows what is stored and an estimate
at the last hour's rate; on a Raspberry Pi with an SD card, prefer "selected signals" or an SSD.

## Exporting to InfluxDB

For Grafana dashboards or keeping values for years at full detail, add an instance of the
[InfluxDB plugin](../plugins/influxdb.md) and choose its signals on its page, the same way as
here: all or chosen ones, per Miniserver, plugin instance or signal. It is independent of the
history: a signal can be exported without being recorded in Nexus, and the other way round.

