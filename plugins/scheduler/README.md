# Scheduler plugin

Sends values at set times: a pulse at 06:30 on workdays, on from 22:00 to 06:00, a setpoint of 21
from 07:00 and 18 from 22:00, or the minutes until the next run. Each schedule is one sensor; wires carry its values to
Loxone or to other plugins. Two actuators switch schedules off and skip their next run.

## What it does

- **Sensors:** a pulse at each run, a window that is on between a start and an end, a number,
  on/off value or text that changes in steps (each step with its own time and value), and when the
  next run is (minutes from now or a date).
- **Actuators:** switch all schedules, or a group of them, on or off; skip the next run of all
  schedules or of a group.
- **Catalog:** a ready-made schedule of each kind to start from, and the two actuators for all
  schedules and for each group in use.
- **Panel:** a switch for all schedules and one per group, and a table of the schedules with their
  trigger, the next run counting down, the last run and the state.
- **Actions:** Next runs lists the next 10 runs of a schedule, a cron expression or a time;
  each schedule's row has Run now (a test), Skip next (or Don't skip) and Next runs.

## Before you start

- Nothing to connect: the plugin only needs the right time zone. Nexus takes it from the Loxone
  project it read last; if it has read none and runs in a container (usually UTC), enter your IANA
  zone, such as `Europe/Vienna`, in the settings.

## Configuration

| Field | | Description |
|---|---|---|
| **Time zone** (`timeZone`) | optional | IANA zone such as `Europe/Vienna` that the times of all schedules are in, also for the Loxone date format and the panel. Empty: the zone of the Loxone project Nexus read last, otherwise the server's. |

Everything else is set per schedule, in the settings of its sensor: a time of day and weekdays, or
a cron expression; a group; a random offset.

## Sensors and actuators

| Kind | Name (id) | Value | What it is |
|---|---|---|---|
| sensor | Pulse (`pulse`) | boolean | True at each run, false again after the pulse length (default 1 s). |
| sensor | Window (`window`) | boolean | On from a start until the next end (22:00–06:00 crosses midnight), off otherwise. |
| sensor | Number by time (`value-number`) | number | Steps such as 07:00 Mon–Fri → `21`, 22:00 daily → `18`: each sends its number from its time on. |
| sensor | On/off by time (`value-boolean`) | boolean | Steps that send true or false from their time on. |
| sensor | Text by time (`value-text`) | string | Steps that send a text from their time on, e.g. `day` and `night`. |
| sensor | Next run (`next-run`) | number | When the schedule runs next: minutes from now, Unix time or Loxone date and time. |
| actuator | Enabled (`enabled`) | boolean | Switches the schedules of a group, or all of them, on (true) or off (false). |
| actuator | Skip next run (`skip-next`) | boolean | On true, skips the next run of the schedules of a group, or of all; false does nothing. |

## Good to know

- **Value sensors are a state.** They send the value of the latest step that has passed, also right
  at start. Give them two steps or more: Nexus passes a value on only when it changes, so a single
  step reaches Loxone once, not every day. To start something at a time, use a pulse.
- **Restarts:** a pulse missed while Nexus was down is skipped, except one at most 5 minutes old at
  the start, which runs once then. Windows and value steps work out their state from the clock. A pulse starts with
  false, so it never comes back as true.
- **Daylight saving:** a time skipped in spring runs at the first minute after the gap (02:30 at
  03:00); a time that happens twice in autumn runs once. Schedules with `*` as the hour (hourly,
  every 5 minutes) follow real time instead.
- **Off and skipped are kept** across restarts. Off schedules send nothing; windows send false.
- **The random offset is drawn per run and per schedule**, so two lights with the same times and
  offset switch at different moments. It never reorders runs: a window can't close before it opens.
  A time-of-day window must last, and stay off, more than twice its offset.

## More

The full reference (triggers and cron syntax, DST, random offsets, missed runs, the params of each
sensor and actuator, groups, skipping, the catalog, the panel and its actions, stored data, limits
and tests) is in `REFERENCE.md` next to this file, and on the plugin's page in the Nexus
documentation.
