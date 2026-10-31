import { SchemaWidgets, type DurationUnit } from "./SchemaWidget.ts"

/**
 * What a duration input shows: the typed text and the unit picked. The stored value stays in the
 * field's unit. The unit is picked again only for a value from outside (a loaded config), never
 * for one the user is typing: "1.5" hours would otherwise jump to "90" minutes mid-word.
 */
export class DurationDraft {
  unit: DurationUnit
  text: string
  private emitted: string | undefined

  constructor(value: string, readonly fieldUnit: DurationUnit) {
    this.unit = fieldUnit
    this.text = ""
    this.receive(value)
  }

  /** a value set from outside; the one this draft just produced changes nothing */
  receive(value: string) {
    if (value === this.emitted) return
    this.emitted = undefined
    const amount = Number(value)
    if (value === "" || !Number.isFinite(amount)) {
      this.text = value
      return
    }
    this.unit = SchemaWidgets.unitFor(amount, this.fieldUnit)
    this.text = String(SchemaWidgets.convert(amount, this.fieldUnit, this.unit))
  }

  /** the user typed: returns the value to store; text that isn't a number is stored as it is, for the form to refuse */
  type(text: string) {
    this.text = text
    const amount = Number(text)
    this.emitted = text.trim() === "" || !Number.isFinite(amount) ? text : String(SchemaWidgets.convert(amount, this.unit, this.fieldUnit))
    return this.emitted
  }

  /** the user picked another unit: the amount is shown in it, the value stays */
  pick(unit: DurationUnit) {
    const amount = Number(this.text)
    if (this.text.trim() !== "" && Number.isFinite(amount)) this.text = String(SchemaWidgets.convert(amount, this.unit, unit))
    this.unit = unit
  }
}
