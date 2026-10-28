# 0012: Value history in its own SQLite file, as changes plus time-weighted buckets

## Context
Statistics need the past values of signals: charts in Nexus, and later an export to InfluxDB
(a plugin, see the statistics plan). Nexus already writes the last value of every signal (the
snapshot) every 5 s; history is different in size. 500 signals that change every 10 s produce
4.3 million changes a day, about 130 MB. A typical installation, where most signals change a few
times an hour, produces a few MB. Many installations run on a Raspberry Pi with an SD card.

## Decision
- History lives in `history.db` next to `nexus.db`, opened with the same `Database` and `Migrator`
  classes but its own migrations, and with `synchronous = NORMAL`. No foreign keys reach across
  the files; history goes once its signal has been missing from the configuration (`signals`
  table) for an hour, so a config import that removes and re-adds signals keeps their history.
- Three tiers: every change (raw), 5-minute buckets and 1-hour buckets, each kept for a
  configurable number of days (7, 90 and 730 by default; 0 keeps forever). Buckets hold min, max,
  a time-weighted sum and duration (average = sum / duration), the number of changes and the last
  value. They are computed in memory from the live values (core, IO-free) and written in parts that
  merge in SQL, so a bucket split by a restart ends up whole. Only buckets with a change are
  written; in between, the value was constant, which readers know from the previous `last`.
- Writes are batched like the snapshot: one transaction every 5 s, open buckets every 60 s and on
  shutdown, never a write per value. Changes of one signal less than a second apart keep only the
  latest as a raw value (configurable); the buckets see all of them.
- What is recorded is chosen by the user: every signal, or only selected ones, with rules per
  signal, Miniserver or plugin instance (`selection_rules` in the main database). The default
  records nothing until the user chooses, so nobody fills an SD card by accident.

## Consequences
- The configuration database stays small and safe; history can be deleted, or left out of a
  backup, on its own. A power cut may cost the last seconds of history, never configuration.
- Charts over years read the 1-hour tier: a year of one signal is at most 8 760 rows.
- Time-weighted averages make an on/off signal's average its share of time on, and keep bursts of
  changes from skewing averages.
- A crash loses up to 5 s of raw values and 60 s of bucket data.
- Measured (`apps/server/src/test-support/HistoryLoadCheck.ts`, 500 signals every 10 s): 131 MB a
  day, a 5-second batch takes 6 ms (median), 58 ms (p99) on a desktop machine; a Raspberry Pi with
  an SD card is slower, which is one reason for the "selected" default.
