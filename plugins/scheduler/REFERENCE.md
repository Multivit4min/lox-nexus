## How schedules run

Each schedule is a sensor whose params are the schedule. It never waits for a run on one long
timer: it wakes at the next moment that matters, but at least once a minute, and works out from the
clock what is due. So it doesn't drift, isn't limited by the 24.8-day maximum of a timer (a
29 February schedule waits years), and notices a step of the system clock (a Raspberry Pi without
a clock battery setting its time after boot) within a minute.

A run whose time the clock jumped over is run if it is at most 5 minutes late, and otherwise
logged as missed (warning). When the clock goes back by more than 5 minutes, the schedule starts
over from the new time with a warning, so runs in between happen again rather than the schedule
waiting silently until the old time comes round; a smaller step back repeats nothing. What Run now
set up for the old time (a window opened until a time now far off, a value step brought forward)
is dropped then. A time stored
before a restart that lies after the current time (the clock was set back while Nexus was down) is
ignored the same way. Re-checks that change nothing send nothing.

### Time zone

All times are wall-clock times in the plugin's zone: **Time zone** from the settings (an empty field counts as not set), otherwise the
zone of the Loxone project Nexus read last, otherwise the server's. The panel and the Next runs
action name the zone they show times in.

## Triggers

Pulses and next-run sensors choose their trigger (`trigger`); each step of a value sensor has
one of its own, and the window has its own pair (see below):

| `trigger` | Shown as | Params | |
|---|---|---|---|
| `time` | Time and weekdays | `time` (Time, `"HH:MM"`, required), `weekdays` (Weekdays, default all) | At that time on each chosen day. |
| `cron` | Cron expression | `cron` (Cron expression, required) | When a 5-field cron expression matches. |

`weekdays` is a list of `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`; an empty list is refused.

### Cron expressions

Five fields separated by spaces: minute (0–59), hour (0–23), day of month (1–31), month (1–12)
and day of week (0–7, 0 and 7 are Sunday). Each field is a list of items separated by commas:

| Item | Means | Example |
|---|---|---|
| `*` | every value | `* * * * *` every minute |
| `n` | one value | `30 6 * * *` 06:30 |
| `a-b` | a range | `0 8-18 * * *` every hour from 08:00 to 18:00 |
| `*/s`, `a-b/s` | every `s`-th value | `*/15 * * * *` every 15 minutes |
| `a/s` | from `a` to the end, every `s`-th | `5/20 * * * *` at :05, :25, :45 |
| names | `JAN`–`DEC`, `SUN`–`SAT`, any case | `0 7 * * MON-FRI`; `SUN` ends a range as 7 (`MON-SUN`) |

Macros: `@yearly` (`@annually`), `@monthly`, `@weekly`, `@daily` (`@midnight`), `@hourly`.

As in Vixie cron, when both day of month and day of week are restricted (neither starts with `*`),
a day matches if **either** does: `0 8 13 * FRI` runs on every 13th and on every Friday. A field
starting with `*` (also `*/2`) counts as unrestricted, and then both must match.

An invalid expression is refused when the signal is saved, with the field and the reason ("the
minute field has 61; it must be 0 to 59"). So is one that can never run (`0 0 30 2 *`). Use the
**Next runs** action to see what an expression means before saving it.

### Daylight saving time

- A schedule with a fixed hour (every `time` trigger, `30 2 * * *`) follows the wall clock. A time
  skipped when DST starts runs at the first minute after the gap (02:30 runs at 03:00), once even
  if several times fall into the gap. A time that happens twice when DST ends runs once, at its
  first pass.
- A schedule with `*` as its hour (`30 * * * *`, `*/5 * * * *`) follows real time, as ISC cron does:
  it runs in both passes of the repeated hour, and nothing of it happens in the skipped hour.
- Value steps (or a window's start and end) that the gap moves onto one instant count as one: the
  step whose own time is the latest wins, whatever the list order. With steps at 02:15, 02:45 and
  03:00, the 03:00 step's value is sent at 03:00; with only 02:15 and 02:45, the 02:45 step's. Steps
  at exactly the same time otherwise go by list order (the later wins).

### Random offset

`randomMinutes` (Random offset (± minutes), `0` to `120`, default `0`; pulses, values and windows)
moves each run by a random time of up to that many minutes earlier or later, in whole seconds. It
is drawn per run and per schedule, from a secret seed the instance keeps in its store and the run's
time. So the same run keeps its offset across restarts (a window worked out at start agrees with
the one before; the panel's next run is the time it really runs), while outsiders can't predict
it. Two schedules with the same times draw differently.

**Offsets never reorder anything.** A run moves at most halfway (less a second) towards the run
before and the run after it of the same schedule, whatever it drew; a window's starts and ends
count as one sequence. So a window never closes before it opens or skips a day, and an
every-minute schedule with a large offset moves by at most 29 seconds. Away from its neighbours a
run uses the whole offset.

A time-of-day window must last more than twice its offset and be off for more than that, or it is
refused when saved: 22:00–22:30 can't have ± 15 minutes. Cron windows have no fixed length; the
rule above still keeps them in order.

`next-run` has no offset: each schedule draws its own, so it couldn't tell another schedule's
randomised time anyway.

### Missed runs and restarts

- **Pulse:** a run that passed while Nexus (or the instance) was stopped is skipped and
  logged. One whose time was at most 5 minutes before the start runs once at the start, but only a
  run that wasn't dealt with already. Each schedule keeps how far it got: up to each run it ran,
  skipped, didn't run because it was switched off, or missed, and up to the moment it stopped. So:
  - a run at 06:00 followed by a restart at 06:02 isn't run again;
  - a run that was switched off at 06:00 doesn't run when the group is on again and Nexus restarts
    at 06:02;
  - editing a schedule from 07:00 to 06:00 at 06:02 doesn't run it at once (an edit stops the
    sensor and starts a new one);
  - a schedule just added doesn't run for a time already past.
- **Window and value steps:** worked out from the clock at start (a window is on if its latest event
  is a start; steps send the value of the latest step that passed), so they are right after any
  restart and need no grace.
- **Next run:** worked out at start.

## Sensors

Params every schedule has:

| Param | Shown as | Default | |
|---|---|---|---|
| `group` | Group | `""` | A name such as `presence`. The `enabled` and `skip-next` actuators of that group switch all its schedules, and signal lists show them together. Up to 100 characters. |
| `randomMinutes` | Random offset (± minutes) | `0` | See above. Not on `next-run`. |

| Id | Value | Params besides the trigger | |
|---|---|---|---|
| `pulse` | boolean | `seconds` (Pulse length, 0.1 to 3600, default `1`) | True at each run, false after `seconds`. A run during a pulse makes it longer. |
| `next-run` | number | `format` (Send as): `minutesUntil` (default) \| `unix` \| `loxone` | When the schedule runs next, see below. It does nothing at the run itself. |
| `window` | boolean | its own trigger, see below | On between a start and an end. |
| `value-number` | number | `steps`, see below; `value` (Value, required) | Sends each step's number from its time on. |
| `value-boolean` | boolean | `steps`; `value` (Value, default `true`) | Sends each step's true or false from its time on. |
| `value-text` | string | `steps`; `value` (Text, required, up to 1000 characters) | Sends each step's text from its time on. |

### Value steps (`value-number`, `value-boolean`, `value-text`)

`steps` (Steps) is a list of 1 to 50 steps. Each has its own trigger, `time` (with `weekdays`) or
`cron`, as in the table above, and the `value` it sends. `group` and `randomMinutes` belong to the
sensor, not to a step. For example, a heating setpoint:

| Step | Trigger | Value |
|---|---|---|
| 1 | `time` 07:00, Mon–Fri | `21` |
| 2 | `time` 08:00, Sat, Sun | `21` |
| 3 | `time` 22:00, daily | `18` |

- **A state.** The sensor sends the value of the latest step that has passed: right at start (at
  12:00 on a Monday, `21`), then each step's value at its time. It needs no run log and no grace
  for missed runs: after a restart it simply sends the value that holds now.
- **Order.** Steps are taken in time order, whatever their order in the list. A moment two steps
  share belongs to the later one in the list: 07:00 daily → `day`, then 07:00 Mon–Fri → `school`
  gives `school` on workdays. In the DST gap the step meant latest wins (see Daylight saving
  time). Random offsets never reorder steps (see Random offset).
- **Changes only.** The sensor sends a value when it differs from the one before. With one step,
  or steps that all send the same value, the value reaches Loxone once, not at every step: Nexus
  drops an unchanged value on the bus. Use at least two steps with different values, or a pulse
  for "do something at a time".
- **Switched off** it sends nothing. Switched on again it sends the value of the step that holds
  then, if that differs from the last one it sent.
- **Skip next** skips the next step: the value before it stays until the step after.
- **Run now** brings the next step forward: it sends that step's value now, and the value holds
  until the step's own time, from when the schedule goes on as usual. When that value is the one
  already sent, nothing is sent and the answer says so. Not kept across a restart, and dropped when
  the clock goes back by more than 5 minutes. Skip next on the step brought forward releases it:
  the value before comes back at once.
- **Errors** name the step: "step 2: choose at least one weekday", "step 1: the minute field has
  61; it must be 0 to 59"; the form shows them at `steps[1].weekdays` and the like.
- Before the first step has ever passed (all steps are years away), it sends nothing.

### Pulse after a restart

A pulse must never come back as true. Nexus keeps a sensor's last value, and a sensor can't send
anything once it is being stopped, so an instance stopped in the middle of a pulse leaves true on
the bus. The pulse sensor therefore sends false the moment it starts, before anything else, and
the run that caused the pulse is recorded, so the grace doesn't repeat it. A wire with *sync on
start* may still forward the stale true for the moment between the instance's start and the
sensor's false; keep *sync on start* off for pulses.

### `window`

| `trigger` | Shown as | Params | |
|---|---|---|---|
| `time` | Times and weekdays | `start` (On at), `end` (Off at), `weekdays` (default all) | On at `start` on each chosen day, off at the next `end`. An end earlier than the start is the next day: 22:00–06:00 opened on Friday closes on Saturday at 06:00. |
| `cron` | Cron expressions | `startCron` (On (cron)), `endCron` (Off (cron)) | On when `startCron` matches, off when `endCron` matches. |

A window is on if its latest event is a start; starts and ends are one sequence in time order. A
moment that is both a start and an end counts as an end, so a window whose start and end both fall
into the hour skipped in spring (02:15–02:45, both run at 03:00) doesn't open that night. A start
while it is on, or an end while it is off, changes nothing. A window that opens and closes at the
same time (or the same expressions) is refused when saved.

### `next-run` formats

The same formats as the Calendar plugin's `time` sensor:

| Format | Shown as | Value | Without a next run |
|---|---|---|---|
| `minutesUntil` | Minutes from now | Whole minutes until the next run, rounded up: `1` in the last minute before it. Updated every minute. | `1000000` |
| `unix` | Unix time (seconds since 1970) | Seconds since 1970-01-01 UTC. | `0` |
| `loxone` | Loxone date and time (seconds since 2009, local time) | Seconds since 2009-01-01 00:00 local time, the way a Miniserver counts date and time. | `0` |

While the schedule is switched off there is no next run, so it sends `1000000` (minutes) or `0`
(dates). Skipped runs are left out. A run more
than 1000000 minutes (about 694 days) away, which only a 29 February schedule can be, is sent as
`1000000` in minutes; the date formats give its date.

## Actuators

Both take `group` (Group, default `""`): the schedules whose group is this, or all schedules of the
instance when empty.

| Id | Accepts | |
|---|---|---|
| `enabled` | boolean | True switches the target on, false off. A schedule runs only while both "all schedules" and its group are on. Off schedules send nothing; windows send false; next-run sensors send `1000000` (minutes) or `0` (dates). A value the host replays after a start is applied (it is a state). |
| `skip-next` | boolean | On true, skips the next run of each targeted schedule (the schedules are told once, however many it skips). A window open now is the one skipped: it closes at once and stays closed until its end. A second true while the run is still skipped does nothing; false does nothing, so a Loxone pulse acts once. A value replayed after a start is ignored, so a restart doesn't skip another run. |

Both are kept in the store and survive restarts. A skip is kept until its run is over and forgotten
after: for pulses 5 minutes after the run (the grace), so a restart in between doesn't run it late;
for windows until the window's end; for value steps until the step after the skipped one; for
next-run sensors until the run. Switched off and skipped schedules show so on the panel.

## Catalog

- **New schedules:** a pulse at 06:30 on workdays, a pulse every 15 minutes, a night window
  22:00–06:00, a presence window 19:00–23:00 ± 20 minutes in the group `presence`, a setpoint
  (21 from 06:00 on workdays and 08:00 at weekends, 18 from 22:00), on from 07:00 to 08:30 on
  workdays as on/off steps, a text mode (`day` from 07:00, `night` from 22:00), and the minutes
  until 07:00 on workdays. Change their settings
  after adding them.
- **All schedules:** Enabled and Skip next run without a group.
- **Group "…"**: the same for each group a running schedule uses.

## Panel

Two sections, pushed to open pages when a run fires or a switch or skip changes.

- **Switched on:** the time zone, a switch for all schedules and one per group (also groups
  switched off that no running schedule uses any more). Each has a **Signals** button opening
  its actuators in the catalog.
- **Schedules:** per schedule its name, kind, trigger in words ("06:30 Mon–Fri", "cron 0 7 * * *",
  "22:00–06:00 daily ± 10 min", for steps "07:00 Mon–Fri → 21; 22:00 daily → 18", shortened to the
  first step and their number when longer than 80 characters), group, the next run with a live
  countdown (for windows "on …" or "off …", for steps with "→ value"; "none" while off), the last
  run (for windows: the last time it switched on; for steps: the latest step that passed), and the
  state: `enabled` (green; a window shows `enabled, on` in green and `enabled, off` in blue),
  `skips next` (amber) or `disabled: …` (grey, with the reason).

Row buttons:

- **Run now** fires the schedule once as a test: sends a pulse, opens the window until its next
  end (kept across a restart), or brings the next value step forward (sends its value now; see
  Value steps). Refused while the schedule is switched off, and not offered for next-run sensors.
  For pulses and windows it counts as the last run.
- **Skip next** / **Don't skip** skips the next run like the actuator, or takes the skip back.
- **Next runs** lists the schedule's next 10 runs (for windows, start – end; for steps, the time
  and "→ value"), skipped ones marked.

The **Next runs** button at the top lists the next 10 runs of a cron expression or of a time and
weekdays you enter, in the instance's zone, to check an expression before using it.

## Stored data

| Key | Holds |
|---|---|
| `seed` | The secret the random offsets are drawn from. Clearing it draws new offsets. |
| `disabled` | The targets switched off: `""` for all schedules, else group names. |
| `skips` | Per schedule, the skipped run and until when the skip is kept. |
| `run:<schedule>` | One key per pulse and per window (next-run sensors and value steps keep nothing): when its sensor last started (`seen`), last ran (`ran`), how far it dealt with its runs (`handled`, for the grace), and until when Run now opened a window (`openUntil`). A run writes only its own key. Records whose latest time is more than 400 days ago are dropped at start. |

Schedules are keyed by their signal's id, which edits keep (`<schedule>` above). Clearing the stored data switches
everything on, drops skips and draws new offsets.

## Limits

- Minute resolution, like cron; no seconds field.
- Runs are searched up to 8 years ahead (the longest gap between two 29 Februaries).
- A random offset is at most 120 minutes; a pulse 0.1 s to 1 hour.

## Development

- No external system: tests run the plugin with `PluginTestHost` on a `TestClock`
  (`SchedulerHarness` in `src/test-support`), in Europe/Vienna, and move the clock by hand, so
  runs, pulses, windows, restarts and clock jumps are checked to the second without waiting.
- `CronExpression` and `CronSchedule` have their own tests: syntax and messages, Vixie OR
  semantics, 29 February across 2100, both DST changes in Vienna and in New York, zones with half
  hours. A pulse and a night window are also run across both Vienna changes.
- `Timeline` tests check that offsets never reorder events (short windows near midnight with many
  seeds, every-minute schedules), and the robustness tests cover clock steps back, grace after a
  run that was switched off or edited, and more than 10 schedules.
