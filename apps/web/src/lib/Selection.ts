import { reactive } from "vue"

/**
 * Which rows of a long list are selected, by key. "All" means all rows currently visible (after
 * filtering), so a bulk action never touches rows the user can't see.
 */
export class Selection {
  private readonly keys = reactive(new Set<string>())

  get size() {
    return this.keys.size
  }

  has(key: string) {
    return this.keys.has(key)
  }

  toggle(key: string, selected: boolean) {
    if (selected) this.keys.add(key)
    else this.keys.delete(key)
  }

  /** checked, unchecked or "indeterminate", for a header checkbox over these rows */
  stateOf(visible: readonly string[]): boolean | "indeterminate" {
    const selected = visible.filter(key => this.keys.has(key)).length
    if (selected === 0) return false
    return selected === visible.length ? true : "indeterminate"
  }

  /** selects all visible rows, or clears them when all already are */
  toggleAll(visible: readonly string[]) {
    const select = this.stateOf(visible) !== true
    for (const key of visible) this.toggle(key, select)
  }

  /** the selected keys that are still visible, in list order */
  pick(visible: readonly string[]) {
    return visible.filter(key => this.keys.has(key))
  }

  /** drops keys of rows that no longer exist */
  retain(existing: readonly string[]) {
    const keep = new Set(existing)
    for (const key of [...this.keys]) if (!keep.has(key)) this.keys.delete(key)
  }

  clear() {
    this.keys.clear()
  }
}
