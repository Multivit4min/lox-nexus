import { Plugin } from "@lox-nexus/plugin-sdk"
import { DismissActuator } from "./actuators/DismissActuator.ts"
import { Agenda } from "./agenda/Agenda.ts"
import { Dismissals } from "./agenda/Dismissals.ts"
import { calendarConfigSchema, type CalendarConfig } from "./CalendarConfig.ts"
import { CalendarPanel } from "./CalendarPanel.ts"
import { CalendarCatalog } from "./catalog/CalendarCatalog.ts"
import { CalendarSource } from "./feed/CalendarSource.ts"
import { FeedClient } from "./feed/FeedClient.ts"
import { ShownFilters } from "./filter/ShownFilters.ts"
import { IcsReader } from "./ics/IcsReader.ts"
import { ActiveSensor } from "./sensors/ActiveSensor.ts"
import { TimeSensor } from "./sensors/TimeSensor.ts"
import { TitleSensor } from "./sensors/TitleSensor.ts"
import { Zone } from "./time/Zone.ts"

/**
 * Reads an iCal feed (Google, Nextcloud, Outlook, any .ics link) with recurrences, all-day events
 * and time zones. Sensors tell whether a matching event is active, its title and its times; the
 * dismiss actuator hides an active occurrence, e.g. "bins are out".
 */
export class CalendarPlugin extends Plugin<CalendarConfig> {
  static readonly config = calendarConfigSchema
  static readonly sensors = [ActiveSensor, TitleSensor, TimeSensor]
  static readonly actuators = [DismissActuator]

  readonly zone = new Zone(this.config.timeZone ?? Zone.server())
  readonly agenda = new Agenda(new Dismissals(this.store), error => this.log.error("a sensor failed to update", { error: String(error) }))
  readonly shown = new ShownFilters()
  readonly client = new FeedClient({
    url: this.config.url, username: this.config.username, password: this.config.password, timeoutMs: this.config.timeout * 1000
  })

  readonly source = this.own(new CalendarSource(
    this.client, new IcsReader(this.zone), this.agenda, problem => this.problemChanged(problem), this.log
  ))

  // One read now, then one per interval (the old integration read twice at start). The first
  // read isn't awaited: an unreachable feed must not fail the start, it starts degraded instead.
  override start() {
    void this.source.refresh()
    this.every(this.config.refreshMinutes * 60_000, () => void this.source.refresh())
  }

  override catalog() {
    return new CalendarCatalog(this.agenda.visible, this.clock.now(), this.zone).build()
  }

  override panel() {
    return new CalendarPanel(this.source, this.agenda, this.zone, this.client.host).build(this.clock.now())
  }

  private problemChanged(problem: string | undefined) {
    if (problem) {
      this.log.warn("can't read the calendar; keeping the last one read", { problem })
      return this.status.set("degraded", this.agenda.loaded ? `${problem}; using the calendar read ${this.source.lastSuccess?.toISOString()}` : problem)
    }
    this.log.info("reading the calendar again", { host: this.client.host })
    this.status.set("running")
  }
}
