/** "1 wire", "3 wires": the counts in confirmation summaries */
export class Counted {
  static of(count: number, noun: string) {
    return `${count} ${noun}${count === 1 ? "" : "s"}`
  }
}
