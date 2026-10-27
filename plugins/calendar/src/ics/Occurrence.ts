/**
 * One occurrence of a calendar event: a single event, or one instance of a recurring series
 * (with its RECURRENCE-ID override applied). Plain data, so everything after the parser works
 * without knowing iCalendar.
 */
export interface Occurrence {
  /** the event's UID; shared by every occurrence of a series */
  uid: string
  /** unique per occurrence: the UID plus the start, so one occurrence of a series can be dismissed */
  key: string
  start: Date
  /** exclusive; equal to start for an event without duration */
  end: Date
  /** a date-only event, from local midnight to local midnight in the plugin's time zone */
  allDay: boolean
  summary: string
  description: string
  location: string
}
