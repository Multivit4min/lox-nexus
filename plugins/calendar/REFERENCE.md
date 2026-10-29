## How the feed is read

The plugin reads the feed at start and then once per refresh interval. When the server sends an
ETag or Last-Modified header, later reads are conditional: an unchanged feed is answered with 304
and isn't downloaded or parsed again, only expanded for the new time. A `webcal://` or
`webcals://` link is read over https.

It expands recurring events (RRULE, EXDATE, moved or retitled occurrences via RECURRENCE-ID),
leaves out cancelled occurrences (`STATUS:CANCELLED`), and handles all-day events and time zones
(Windows zone names from Outlook included). Occurrences are kept from a day ago (the longest lag a
signal may add) to 400 days ahead.

Sensors don't poll: each one sets a timer for the exact moment its next event becomes active or
ends, and checks again at least every 15 minutes, so a jump of the system clock (a Raspberry Pi
without a clock battery setting its time after boot) is caught up quickly. Re-checks that change
nothing send nothing, so Loxone gets one value per transition.

### Credentials in the link

`https://user:pass@host/…` works: the user and password become HTTP basic auth, as in a browser.
They are percent-encoded: `%40` for `@`, `%25` for `%`. A link whose encoding can't be read
(`https://a%zz@host/…`) is refused. **User name** and **Password** in the form take precedence over
the ones in the link.

### Time zone

All-day events, times without a zone, the `loxone` time format and the panel use the plugin's time
zone: **Time zone** from the config, otherwise the zone of the Loxone project Nexus read last (when
signals were imported from it), otherwise the server's. Containers usually run in UTC, so set it
when Nexus runs in one and has read no project.

- Floating times (no zone) are read in the feed's own zone when it declares one with a
  `VTIMEZONE`, otherwise in the plugin's zone. `X-WR-TIMEZONE` (Google's calendar zone property)
  is ignored.
- A TZID nobody knows and without a `VTIMEZONE` (`TZID=Foo/Bar`) is read like a floating time.

### Broken feeds

One malformed event (a broken RRULE, an unreadable date) doesn't make the feed unreadable: that
event is left out and named in the log and the panel, the rest is read. Events without a UID (some
generated feeds, e.g. waste collection exports) get a stable one from their start and title, so
dismissals keep working across reads.

### Failures

A feed that can't be read leaves the instance degraded with the reason, and the sensors carry on
with the last calendar read successfully. Messages name the feed's host only, never the link.

- 401 and 403 say to check the user name and password, or whether the private link is still valid.
- 404 and 410 say there is no calendar at the link: it may have been reset or deleted.
- A timeout says "no answer within N s"; a network error says "unreachable" with the reason.
- An answer that isn't an iCalendar feed (an HTML login page) is reported with its first characters.

An unreachable feed at start only makes the instance degraded; it doesn't fail the start. Only an
invalid config does: a wrong URL scheme, unreadable credentials in the link, a password without a
user name, or an unknown time zone. A failure is logged when its reason changes, not on every read.

## Filter params (all sensors and `dismiss`)

| Param | Shown as | Default | |
|---|---|---|---|
| `match` | Text to look for | none: every event | Text the event must contain, ignoring case. |
| `field` | Look in | `summary` | Where to look: `summary` (Title), `description` (Description), `location` (Location) or `any` (Title, description or location). |
| `regex` | Regular expression | `false` | Treat `match` as a regular expression (ignoring case), e.g. `^(Paper\|Plastic)$`. One that doesn't compile is refused when the signal is added. |
| `leadMinutes` | Minutes before the start | `0` | The event counts as active this many minutes before its start, up to 43 200 (30 days). |
| `lagMinutes` | Minutes after the end | `0` | It stays active this many minutes after its end, up to 1440 (a day). |

An occurrence is **active** from start − lead until end + lag. An all-day event runs from local
midnight to the next midnight (a two-day event to the midnight after its second day). An all-day
event without an end lasts one day. A timed event without an end (DTSTART only) takes no time and
is active only through its lead and lag. An end before the start is treated as equal to the start.

When several matching occurrences are active, the **current** one is the one that started first.
The **next** one is the first matching occurrence that isn't active yet.

## Sensors

Before the feed has been read once, sensors send nothing, so a restart with the feed down doesn't
switch Loxone outputs off. The calendar isn't persisted: it can be megabytes, too much for the
store. A sensor that fails to work out its value is marked failed with the reason; its next value
clears that.

| Id | Value | Params | |
|---|---|---|---|
| `active` | boolean | filter | True while a matching occurrence is active. |
| `title` | string | filter, `which` (Event): `current` (Current event, default) \| `next` (Next event), `show` (Text to send): `summary` (Title, default) \| `description` \| `location` | The text of the current or next matching occurrence; `""` without one. |
| `time` | number | filter, `which` (Time): `currentStart` \| `currentEnd` \| `nextStart` (default) \| `nextEnd`, `format` (Send as): `minutesUntil` (default) \| `unix` \| `loxone` | The start or end of the current or next matching occurrence (the event's own times, without lead or lag). |

With a lead, an occurrence turns *current* at start − lead, so `time` with `nextStart` in
`minutesUntil` never goes below lead + 1; use `currentStart` to count down the last stretch.

### `time` formats

| Format | Shown as | Value | Without an event |
|---|---|---|---|
| `minutesUntil` | Minutes from now | Whole minutes from now, rounded up: `1` in the last minute before, `0` in the first minute after, negative once passed. Updated every minute. | `1000000` |
| `unix` | Unix time (seconds since 1970) | Seconds since 1970-01-01 UTC. | `0` |
| `loxone` | Loxone date and time (seconds since 2009, local time) | Seconds since 2009-01-01 00:00 **local time**, the way a Miniserver counts date and time. Feed it to a block that expects a Loxone date/time and it shows the right local time, also across DST. | `0` |

`1000000` minutes (about 694 days) is beyond any real value, as the plugin reads 400 days ahead.
So a comparison such as "minutes until next start < 30" stays false when there is no next event,
and `>= 1000000` tests for "none". For the date formats, `0` is a date no event has. Values go to
the Miniserver as 64-bit floats, so the second counts are exact.

## Actuator

| Id | Accepts | Params | |
|---|---|---|---|
| `dismiss` | boolean | filter | On **true**, dismisses the matching occurrences that are shown now (see below). False does nothing, so a Loxone pulse acts once. Nothing shown: nothing happens. |

### What dismiss hides

A matching occurrence is dismissed when it is active by the actuator's own lead and lag, **or**
when a sensor of the instance shows it right now: an `active` sensor, or a `title` or `time`
sensor about the current event, whose filter matches it and whose lead or lag covers now. So with
an `active` sensor `{ match: "waste", leadMinutes: 720 }` lighting "bins out tomorrow" the evening
before, the catalog's "Dismiss Waste collection" (no lead) hides it, and it stays hidden through
the collection. Sensors about the **next** event don't count: they always name something, and
dismiss would then hide events far ahead.

A dismissed occurrence is skipped by **every sensor of the instance**: they behave as if it weren't
in the calendar. Only that occurrence is dismissed, not its series.

Dismissals are stored per occurrence (UID and start) and survive restarts. Each is forgotten one
day after its occurrence ended (the longest lag a sensor may have), at the next read or dismissal,
so the store doesn't grow. An occurrence the organiser moves after it was dismissed counts as a new
one.

## Catalog

Sensors in the catalog show the value they would send now; the minute counts carry the unit `min`.

- **Any event:** Event active, Current event title, Next event title, Minutes until the next event,
  Minutes until the current event ends, and Dismiss the active events, all without a filter.
- **Events by title:** for each distinct title among the upcoming, not dismissed occurrences
  (at most 50, soonest first): "*title* active", "Minutes until the next *title*" and
  "Dismiss *title*", with `match` set to the title. `match` is a substring, so "Training" also
  matches "Training (moved)"; use `regex` with `^…$` for an exact title.

## Panel

Two sections.

- **Feed:** the feed's host, the last successful read (UTC), the number of upcoming occurrences in
  the next 400 days, the number of dismissals, the time zone, the last error with its time (kept
  after the feed recovers), events left out (unreadable or repeating too often) and series cut
  short (too many occurrences).
- **Next 15 events:** a table of when, in the plugin's time zone ("2026-11-02 18:00 – 19:00", or
  "2026-11-02, all day"), the title ("(no title)" without one), and "dismissed" where it applies.

## Limits

- A series keeps its first 1000 occurrences in the window (an hourly one about six weeks), so dense
  series don't crowd out other events; series cut short are named in the log and the panel. A rule
  that repeats too often to expand at all (every minute) is left out the same way. Beyond 20 000
  occurrences in all, the far future is cut and reported.
- Feeds over 8 MB are refused: the worker has a 128 MB heap, a parsed calendar takes several times
  its text, and the last good calendar stays in memory while the next one is parsed. Real calendars
  with years of history are 1 to 5 MB.
- The calendar is held in memory only. After a restart with the feed unreachable, sensors send
  nothing until a read succeeds; Loxone keeps the last values.
- No CalDAV: the plugin reads a feed URL, it doesn't browse calendar collections or write events.

## Security

- The link is secret: private links carry their access token. It is never shown again, logged or
  put in the panel; messages name the host only. The password is secret too.
- A secret can't be removed from the UI once stored (true for every plugin). To drop the password,
  recreate the instance.
- `regex` patterns run in the plugin's worker. A catastrophic pattern can stall it until Nexus
  restarts the worker.

## Fixed compared to the old integration

- The end of an event counts. The old integration ignored it and treated an event as over at
  "start + time after", whatever its length.
- Dismiss hides one occurrence. The old integration hid every occurrence of a series and never
  forgot a dismissal.
- The feed is read once at start, not twice.

## Development

- `IcsServer` (in `src/test-support`) serves the synthetic feeds in `test/fixtures` on 127.0.0.1:
  a single event, all-day events (one-day, two-day and yearly), a weekly series with an EXDATE and
  a moved occurrence, and events in New York, in a Windows zone name (Outlook) and in floating time.
  Error answers (401, 403, 404, 500, HTML) are served on demand.
- `CalendarHarness` runs the plugin with a faked clock (`mock.timers` for setTimeout, setInterval
  and Date), so transitions are checked to the minute without waiting.
- `IcsReader` tests also run with the process in another time zone, to show all-day events don't
  depend on the server's zone. Broken feeds (malformed rules and dates, missing UIDs, unknown
  zones, dense series) have their own tests.
