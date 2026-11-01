/** What one of the five fields of a cron expression may hold. */
export interface CronFieldSpec {
  /** for messages: "minute", "day of week" */
  readonly name: string
  readonly min: number
  readonly max: number
  /** names for values, lowercase ("jan" → 1), case-insensitive in expressions */
  readonly names?: Readonly<Record<string, number>>
  /** names that mean another value at the end of a range: `SUN` is 7 in `MON-SUN` */
  readonly endNames?: Readonly<Record<string, number>>
}

/**
 * One field of a cron expression, parsed: a list of items separated by commas, each `*`, a value,
 * or a range `a-b`, optionally with a step (`*\/15`, `8-18/2`, and `5/10`, which counts from 5 to
 * the end as in Vixie cron). Names (`MON`, `JAN`) stand for their values.
 */
export class CronField {
  private constructor(
    /** the matching values, ascending */
    readonly values: readonly number[],
    /** whether the field starts with `*`; day of month and day of week are then unrestricted (Vixie cron) */
    readonly star: boolean
  ) {}

  /** @throws Error with a message that names the field and the problem */
  static parse(text: string, spec: CronFieldSpec): CronField {
    if (text === "") throw new Error(`the ${spec.name} field is empty`)
    const values = new Set<number>()
    for (const item of text.split(",")) {
      for (const value of CronField.item(item, spec)) values.add(value)
    }
    return new CronField([...values].sort((a, b) => a - b), text.startsWith("*"))
  }

  has(value: number) {
    return this.values.includes(value)
  }

  private static item(item: string, spec: CronFieldSpec): number[] {
    const field = `the ${spec.name} field`
    if (item === "") throw new Error(`${field} has an empty item (two commas in a row?)`)
    const [range = "", stepText, extra] = item.split("/")
    if (extra !== undefined) throw new Error(`${field} has more than one "/" in "${item}"`)
    const step = stepText === undefined ? 1 : CronField.number(stepText, `${field} has the step "${stepText}", which isn't a whole number`)
    const [from, to] = CronField.range(range, stepText !== undefined, spec)
    if (step < 1 || step > spec.max - spec.min + 1) {
      throw new Error(`${field} has the step ${step}; it must be 1 to ${spec.max - spec.min + 1}`)
    }
    const values: number[] = []
    for (let value = from; value <= to; value += step) values.push(value)
    return values
  }

  private static range(range: string, stepped: boolean, spec: CronFieldSpec): [number, number] {
    if (range === "*") return [spec.min, spec.max]
    const [fromText = "", toText, extra] = range.split("-")
    if (extra !== undefined) throw new Error(`the ${spec.name} field has more than one "-" in "${range}"`)
    const from = CronField.value(fromText, spec)
    if (toText === undefined) return [from, stepped ? spec.max : from]
    const to = spec.endNames?.[toText.toLowerCase()] ?? CronField.value(toText, spec)
    if (to < from) throw new Error(`the ${spec.name} field has the range ${range}, which ends before it starts`)
    return [from, to]
  }

  private static value(text: string, spec: CronFieldSpec) {
    const named = spec.names?.[text.toLowerCase()]
    if (named !== undefined) return named
    const value = CronField.number(text, `the ${spec.name} field has "${text}", which is neither a number${spec.names ? " nor a name" : ""}`)
    if (value < spec.min || value > spec.max) throw new Error(`the ${spec.name} field has ${value}; it must be ${spec.min} to ${spec.max}`)
    return value
  }

  private static number(text: string, message: string) {
    if (!/^\d{1,4}$/.test(text)) throw new Error(message)
    return Number(text)
  }
}
