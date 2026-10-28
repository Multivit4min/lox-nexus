# Calendar plugin

Reads an **iCal feed** (an `.ics` link from Google Calendar, Nextcloud, Outlook, iCloud or any other
calendar) and tells Loxone whether a matching event is on, what it is called and when it starts
or ends. A `dismiss` actuator hides an occurrence that has been dealt with, e.g. "bins are out".

The plugin reads the feed at start and then once per refresh interval. When the server sends an
ETag or Last-Modified header, later reads are conditional: an unchanged feed is answered with 304
and isn't downloaded or parsed again, only expanded for the new time. It expands recurring events
(RRULE, EXDATE, moved or retitled occurrences via RECURRENCE-ID, cancelled occurrences), all-day
events and time zones, from a day ago to 400 days ahead. Sensors don't poll: each one sets a
timer for the exact moment its next event becomes active or ends, and checks again at least every
15 minutes, so a jump of the system clock (a Raspberry Pi without a clock battery setting its time
after boot) is caught up quickly.

**Broken feeds.** One malformed event (a broken RRULE, an unreadable date) doesn't make the feed
unreadable: that event is left out and named in the log and the panel, the rest is read. Events
without a UID (some generated feeds, e.g. waste collection exports) get a stable one from their
start and title, so dismissals keep working across reads.

## Config

| Field | | |
|---|---|---|
| `url` | required, secret | Link to the feed: `http`, `https` or `webcal` (read over https). Private links carry their access token in the URL, so the link is secret: it is never shown again, logged or put in the panel. Messages name the host only. `https://user:pass@host/…` works too; the credentials become basic auth (percent-encoded: `%40` for `@`, `%25` for `%`). |
| `username` | optional | For feeds behind HTTP basic auth, e.g. a Nextcloud calendar's CalDAV export. |
| `password` | optional, secret | The password or app password for `username`; refused without a `username`. |
| `refreshMinutes` | default 15 | Minutes between two reads, 1 to 10 080 (a week). |
| `timeout` | default 30 | Seconds one read may take, 1 to 120. |
| `timeZone` | optional | IANA zone such as `Europe/Vienna`, used for all-day events, times without a zone, the `loxone` time format and the panel. Default: the server's zone. **Set it when Nexus runs in a container**, which usually runs in UTC: otherwise all-day events start at 01:00 or 02:00 Vienna time. |

**Failures.** A feed that can't be read leaves the instance degraded with the reason, and the
sensors carry on with the last calendar read successfully. 401 and 403 say to check the
username and password or whether the private link is still valid; 404 and 410 that the link
may have been reset. An unreachable feed at start only makes the instance degraded, it doesn't
fail the start. Only an invalid config does (a wrong URL scheme, an unknown time zone).

## Filter params (all sensors and `dismiss`)

| Param | Default | |
|---|---|---|
| `match` | none: every event | Text the event must contain, ignoring case. |
| `field` | `summary` | Where to look: `summary`, `description`, `location` or `any`. |
| `regex` | `false` | Treat `match` as a regular expression (ignoring case), e.g. `^(Paper\|Plastic)$`. One that doesn't compile is refused when the signal is added. |
| `leadMinutes` | 0 | The event counts as active this many minutes before its start (up to 30 days). |
| `lagMinutes` | 0 | It stays active this many minutes after its end (up to a day). |

An occurrence is **active** from start − lead until end + lag. The end counts: the old integration
ignored it and treated an event as over at "start + time after", whatever its length. An all-day
event runs from local midnight to the next midnight (a two-day event to the midnight after its
second day). An all-day event without an end lasts one day. A timed event without an end (DTSTART
only) takes no time and is active only through its lead and lag. An end before the start is
treated as equal to the start.

When several matching occurrences are active, the **current** one is the one that started first.
The **next** one is the first matching occurrence that isn't active yet.

## Sensors

Before the feed has been read once, sensors send nothing, so a restart with the feed down doesn't
switch Loxone outputs off. The calendar isn't persisted: it can be megabytes, too much for the
store.

| Id | Value | Params | |
|---|---|---|---|
| `active` | boolean | filter | True while a matching occurrence is active. |
| `title` | string | filter, `which`: `current` (default) \| `next`, `show`: `summary` (default) \| `description` \| `location` | The text of the current or next matching occurrence; `""` without one. |
| `time` | number | filter, `which`: `currentStart` \| `currentEnd` \| `nextStart` (default) \| `nextEnd`, `format`: `minutesUntil` (default) \| `unix` \| `loxone` | The start or end of the current or next matching occurrence (the event's own times, without lead or lag). With a lead, an occurrence turns *current* at start − lead, so `nextStart` in `minutesUntil` never goes below lead + 1; use `currentStart` to count down the last stretch. |

**`time` formats:**

| Format | Value | Without an event |
|---|---|---|
| `minutesUntil` | Whole minutes from now, rounded up: `1` in the last minute before, `0` in the first minute after, negative once passed. Updated every minute. | `1000000` |
| `unix` | Seconds since 1970-01-01 UTC. | `0` |
| `loxone` | Seconds since 2009-01-01 00:00 **local time**, the way a Miniserver counts date and time. Feed it to a block that expects a Loxone date/time and it shows the right local time, also across DST. | `0` |

`1000000` minutes (about 694 days) is beyond any real value, as the plugin reads 400 days ahead.
So a comparison such as "minutes until next start < 30" stays false when there is no next event,
and `>= 1000000` tests for "none". For the date formats, 0 is a date no event has.
Values go to the Miniserver as 64-bit floats, so the second counts are exact.

## Actuator

| Id | Accepts | Params | |
|---|---|---|---|
| `dismiss` | boolean | filter | On **true**, dismisses the matching occurrences that are shown now (see below). False does nothing, so a Loxone pulse acts once. Nothing shown: nothing happens. |

**What dismiss hides.** A matching occurrence is dismissed when it is active by the actuator's own
lead and lag, **or** when a sensor of the instance shows it right now: an `active` sensor, or a
`title` or `time` sensor about the current event, whose filter matches it and whose lead or lag
covers now. So with an `active` sensor `{ match: "waste", leadMinutes: 720 }` lighting "bins out
tomorrow" the evening before, the catalog's "Dismiss Waste collection" (no lead) hides it, and it
stays hidden through the collection. Sensors about the **next** event don't count: they always
name something, and dismiss would then hide events far ahead. Pressing dismiss while nothing is
shown does nothing.

A dismissed occurrence is skipped by **every sensor of the instance**: they behave as if it weren't
in the calendar. Only that occurrence is dismissed, not its series: next week's occurrence of a
weekly event shows as usual. (The old integration hid every occurrence of a series and never
forgot a dismissal.)

Dismissals are stored per occurrence (UID and start), survive restarts and are forgotten at the
first read after their occurrence ended + one day (the longest lag a sensor may have), so the store
doesn't grow. An occurrence the organiser moves after it was dismissed counts as a new one.

## Catalog

- **Any event:** active, current title, next title, minutes until the next event, minutes until the
  current event ends, and dismiss, all without a filter.
- **Events by title:** for each distinct title among the upcoming occurrences, the 50 soonest:
  active, minutes until the next one and dismiss, with `match` set to the title. `match` is a
  substring, so "Training" also matches "Training (moved)"; use `regex` with `^…$` for an exact
  title.

## Panel

The feed's host, the last successful read, the number of upcoming occurrences, the dismissal count,
the time zone, the last error, events left out and series cut short (see below), and the next 15
occurrences as
"2026-11-02 18:00 – 19:00 = Training", in the plugin's time zone, with "(dismissed)" where it
applies.

## Tests

- `IcsServer` (in `src/test-support`) serves the synthetic feeds in `test/fixtures` on 127.0.0.1:
  a single event, all-day events (one-day, two-day and yearly), a weekly series with an EXDATE and
  a moved occurrence, and events in New York, in a Windows zone name (Outlook) and in floating time.
  Error answers (401, 403, 404, 500, HTML) are served on demand.
- `CalendarHarness` runs the plugin with a faked clock (`mock.timers` for setTimeout, setInterval
  and Date), so transitions are checked to the minute without waiting.
- `IcsReader` tests also run with the process in another time zone, to show all-day events don't
  depend on the server's zone. Broken feeds (malformed rules and dates, missing UIDs, unknown
  zones, dense series) have their own tests.

## Known limitations

- A series keeps its first 1000 occurrences in the window (an hourly one about six weeks), so dense
  series don't crowd out other events; series cut short are named in the log and the panel. A rule
  that repeats too often to expand at all (every second) is left out the same way. Beyond 20 000
  occurrences in all, the far future is cut and reported. Feeds over 8 MB are refused: the worker
  has a 128 MB heap, a parsed calendar takes several times its text, and the last good calendar
  stays in memory while the next one is parsed. Real calendars with years of history are 1 to 5 MB.
- Floating times (no zone) are read in the feed's own zone when it declares one with a
  `VTIMEZONE`, otherwise in the plugin's zone. `X-WR-TIMEZONE` (Google's calendar zone property)
  is ignored. A TZID nobody knows and without a `VTIMEZONE` (`TZID=Foo/Bar`) is read like a
  floating time.
- The calendar is held in memory only. After a restart with the feed unreachable, sensors send
  nothing until a read succeeds; Loxone keeps the last values.
- A secret can't be removed from the UI once stored (true for every plugin). To drop the password,
  recreate the instance.
- No CalDAV: the plugin reads a feed URL, it doesn't browse calendar collections or write events.
- `regex` patterns run in the plugin's worker. A catastrophic pattern can stall it until Nexus
  restarts the worker.
