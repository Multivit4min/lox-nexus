import type { T5Value } from "./values.ts"

/** Named access to the T5 button bitmask (positions confirmed by a capture, see PROTOCOL.md). */
export class T5Buttons {
  static readonly LEFT_UPPER = 1
  static readonly RIGHT_UPPER = 2
  static readonly MIDDLE = 4
  static readonly LEFT_LOWER = 8
  static readonly RIGHT_LOWER = 16

  private static readonly NAMES: ReadonlyArray<[number, string]> = [
    [T5Buttons.LEFT_UPPER, "left-upper"],
    [T5Buttons.RIGHT_UPPER, "right-upper"],
    [T5Buttons.MIDDLE, "middle"],
    [T5Buttons.LEFT_LOWER, "left-lower"],
    [T5Buttons.RIGHT_LOWER, "right-lower"]
  ]

  /** @param mask OR of the button constants above */
  constructor(readonly mask: number) {}

  static of(value: T5Value) {
    return new T5Buttons(value.buttons)
  }

  /** true only if every bit of `button` is set, so passing a combination means "all of these" */
  isPressed(button: number) {
    return (this.mask & button) === button
  }

  /** false when all buttons are released (mask 0) */
  get anyPressed() {
    return this.mask !== 0
  }

  /** names of all pressed buttons, e.g. ["left-upper", "middle"] */
  names(): string[] {
    return T5Buttons.NAMES.filter(([bit]) => this.isPressed(bit)).map(([, name]) => name)
  }
}
