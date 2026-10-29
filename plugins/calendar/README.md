# Calendar plugin

Reads an iCal feed (an `.ics` link from Google Calendar, Nextcloud, Outlook, iCloud or any other
calendar) and tells Loxone whether a matching event is on, what it is called and when it starts or
ends. Values flow from the calendar to Loxone; the one actuator hides an event that has been dealt
with, such as "bins are out".

## What it does

- **Sensors:** whether a matching event is active, the title, description or location of the
  current or next matching event, and when it starts or ends (minutes from now or a date).
- **Actuators:** dismiss the matching events shown now, so every sensor of the instance skips them.
- **Catalog:** ready-made signals for any event, and for each title among the upcoming events.
- **Panel:** the feed's host, the last read, errors and events left out, and the next 15 events.

## Before you start

- The calendar's iCal link. Google calls it "secret address in iCal format"; Nextcloud, Outlook
  and iCloud offer a share or publish link ending in `.ics` or starting with `webcal://`.
- Network access from the Nexus server to the calendar's host.
- For a feed behind HTTP basic auth (a Nextcloud calendar without a share link): a user name and
  an app password.
- If Nexus runs in a container and has never read a Loxone project, your IANA time zone, such as
  `Europe/Vienna`.

## Configuration

| Field | | Description |
|---|---|---|
| **Calendar link (iCal)** (`url`) | required; secret | The feed's link: `http`, `https`, `webcal` or `webcals` (the last two are read over https), e.g. `https://calendar.google.com/calendar/ical/…/basic.ics`. Private links carry their access token, so the link is never shown again, logged or put in the panel. `https://user:pass@host/…` works too (write `@` as `%40`, `%` as `%25`). |
| **User name** (`username`) | optional | Only for feeds behind HTTP basic auth, e.g. `alice` for a Nextcloud calendar's export link. |
| **Password** (`password`) | optional; secret | The password or app password for **User name**. Refused without a user name. |
| **Read every (minutes)** (`refreshMinutes`) | optional; default `15` | Minutes between two reads of the feed, `1` to `10080` (a week). An unchanged feed costs little, so `15` suits most calendars. |
| **Timeout (seconds)** (`timeout`) | optional; default `30` | Seconds one read may take before it counts as failed, `1` to `120`. |
| **Time zone** (`timeZone`) | optional | IANA zone such as `Europe/Vienna`, for all-day events, times without a zone, the Loxone date format and the panel. Empty: the zone of the Loxone project Nexus read last, otherwise the server's. |

## Sensors and actuators

| Kind | Name (id) | Value | What it is |
|---|---|---|---|
| sensor | Event active (`active`) | boolean | On while a matching event is going on, with its lead and lag time. |
| sensor | Event title (`title`) | string | The title, description or location of the current or next matching event; `""` without one. |
| sensor | Event time (`time`) | number | When the current or next matching event starts or ends: minutes from now, Unix time or Loxone date and time. |
| actuator | Dismiss active events (`dismiss`) | boolean | On true, hides the matching events that are shown now from every sensor of the instance; false does nothing. |

## Good to know

- **Set the time zone in a container.** Containers usually run in UTC; without a Loxone project
  read, all-day events would then start at 01:00 or 02:00 Vienna time.
- **No event:** `time` in minutes sends `1000000`, so "minutes until next < 30" stays false; the
  date formats send `0`, and `title` sends `""`.
- **Feed down:** the instance turns degraded with the reason and the sensors carry on with the
  last calendar read. After a restart with the feed unreachable, sensors send nothing until a read
  works, so Loxone keeps its last values.
- **Dismiss hides one occurrence**, not the series: next week's event of a weekly series shows as
  usual. Dismissals survive restarts.
- **Matching is a substring**, ignoring case: `Training` also matches `Training (moved)`. Use a
  regular expression such as `^Training$` for an exact title.

## More

The full reference (filter params, the params of each sensor and the actuator, time formats, what
dismiss hides, the catalog, the panel, broken feeds and errors, limits and tests) is in
`REFERENCE.md` next to this file, and on the plugin's page in the Nexus documentation.
