# Calendar test fixtures

Synthetic feeds written for the tests; none comes from a real calendar. Dates are in November 2026,
and the tests fake the clock to match.

| File | Content |
|---|---|
| `single.ics` | One event in UTC, with description and location |
| `all-day.ics` | A one-day and a two-day all-day event, and a yearly all-day series |
| `weekly.ics` | A weekly series in Europe/Vienna (VTIMEZONE) with an EXDATE and a moved, retitled occurrence (RECURRENCE-ID), plus a single event |
| `timezone.ics` | An event in America/New_York, one with Outlook's Windows zone name, and one in floating time |
