import type { ScheduleView } from "./ScheduleView.ts"

/** The schedules running now, by key; sensors add themselves in start() and leave when disposed. */
export class Schedules {
  private readonly views = new Map<string, ScheduleView>()

  /** @returns what removes it again, for `own()` */
  add(view: ScheduleView) {
    this.views.set(view.key, view)
    return { dispose: () => void (this.views.get(view.key) === view && this.views.delete(view.key)) }
  }

  get(key: string) {
    return this.views.get(key)
  }

  /** by name, then key */
  list(): ScheduleView[] {
    return [...this.views.values()].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
  }

  /** the ones a target reaches: "" all, else those of that group */
  targeted(group: string): ScheduleView[] {
    return this.list().filter(view => group === "" || view.group === group)
  }

  /** the groups in use, sorted */
  groups(): string[] {
    return [...new Set(this.list().map(view => view.group).filter(group => group !== ""))].sort()
  }
}
