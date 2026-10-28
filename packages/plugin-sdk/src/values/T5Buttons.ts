/** Named access to the T5 button bitmask (layout confirmed on a Miniserver, see packages/ici/PROTOCOL.md). */
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

  /** true only if every bit of `button` is set */
  isPressed(button: number) {
    return (this.mask & button) === button
  }

  /** names of all pressed buttons in bit order */
  names(): string[] {
    return T5Buttons.NAMES.filter(([bit]) => this.isPressed(bit)).map(([, name]) => name)
  }

  /** "left-upper+middle", or "none" */
  toString() {
    return this.names().join("+") || "none"
  }
}
