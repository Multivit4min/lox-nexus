import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { CronExpression } from "./CronExpression.ts"

const parse = (text: string) => CronExpression.parse(text)

describe("CronExpression", () => {
  test("reads values, lists, ranges and steps", () => {
    const expression = parse("0,30 8-18/2 * * *")
    assert.deepEqual(expression.minutes, [0, 30])
    assert.deepEqual(expression.hours, [8, 10, 12, 14, 16, 18])
    assert.deepEqual(parse("*/15 * * * *").minutes, [0, 15, 30, 45])
    assert.deepEqual(parse("5/20 * * * *").minutes, [5, 25, 45], "a value with a step counts to the end, as in Vixie cron")
    assert.deepEqual(parse("1-3,2-4 * * * *").minutes, [1, 2, 3, 4], "overlaps count once")
    assert.equal(parse("  0   12 *  * * ").source, "0 12 * * *")
  })

  test("month and weekday names, any case; 0 and 7 are Sunday; SUN ends a range as 7", () => {
    const expression = parse("0 9 * jan-MAR Mon-Fri")
    assert.ok(expression.matchesDate(2, 3, 1))
    assert.ok(!expression.matchesDate(4, 3, 1), "April is outside JAN-MAR")
    assert.ok(!expression.matchesDate(2, 3, 0), "Sunday is outside MON-FRI")
    assert.ok(parse("0 9 * * 7").matchesDate(1, 4, 0))
    assert.ok(parse("0 9 * * 0").matchesDate(1, 4, 0))
    assert.ok(parse("0 9 * * sat-sun").matchesDate(1, 4, 0))
    assert.ok(parse("0 9 * * 5-7").matchesDate(1, 4, 0))
  })

  test("day of month OR day of week when both are restricted (Vixie cron), AND when one starts with *", () => {
    const either = parse("0 8 13 * FRI")
    assert.ok(either.matchesDate(11, 13, 5), "Friday the 13th")
    assert.ok(either.matchesDate(11, 6, 5), "any Friday")
    assert.ok(either.matchesDate(10, 13, 2), "any 13th")
    assert.ok(!either.matchesDate(11, 12, 4))
    const fridays = parse("0 8 * * FRI")
    assert.ok(fridays.matchesDate(11, 6, 5) && !fridays.matchesDate(11, 13, 2))
    const stepped = parse("0 8 */2 * FRI")
    assert.ok(!stepped.matchesDate(11, 6, 5), "a day field starting with * counts as unrestricted, so both must match")
    assert.ok(stepped.matchesDate(11, 13, 5))
  })

  test("macros", () => {
    assert.deepEqual([parse("@daily").minutes, parse("@daily").hours], [[0], [0]])
    assert.deepEqual(parse("@HOURLY").hours.length, 24)
    assert.ok(parse("@weekly").matchesDate(5, 3, 0) && !parse("@weekly").matchesDate(5, 4, 1))
    assert.ok(parse("@yearly").matchesDate(1, 1, 4) && !parse("@yearly").matchesDate(2, 1, 0))
  })

  test("everyHour only for a bare * in the hour field", () => {
    assert.ok(parse("*/5 * * * *").everyHour)
    assert.ok(!parse("0 */2 * * *").everyHour)
    assert.ok(!parse("30 2 * * *").everyHour)
  })

  test("29 February is valid, 30 February and 31 April never run", () => {
    assert.ok(parse("0 12 29 2 *").matchesDate(2, 29, 4))
    assert.match(CronExpression.problem("0 12 30 2 *") ?? "", /never runs/)
    assert.match(CronExpression.problem("0 12 31 4,6 *") ?? "", /never runs/)
    assert.equal(CronExpression.problem("0 12 31 4,5 *"), undefined)
    assert.equal(CronExpression.problem("0 12 30 2 MON"), undefined, "any Monday, or 30 February")
  })

  test("errors name the field and the problem", () => {
    const cases: Array<[string, RegExp]> = [
      ["", /5 fields.*has 0/],
      ["* * * *", /5 fields.*has 4/],
      ["* * * * * *", /has 6/],
      ["60 * * * *", /minute field has 60; it must be 0 to 59/],
      ["* 24 * * *", /hour field has 24/],
      ["* * 0 * *", /day of month field has 0/],
      ["* * * 13 *", /month field has 13/],
      ["* * * * 8", /day of week field has 8/],
      ["* * * foo *", /month field has "foo", which is neither a number nor a name/],
      ["x * * * *", /minute field has "x", which is neither a number$/],
      ["*/0 * * * *", /step 0; it must be 1 to 60/],
      ["*/a * * * *", /step "a"/],
      ["1,,2 * * * *", /empty item/],
      ["5-1 * * * *", /range 5-1, which ends before it starts/],
      ["1-2-3 * * * *", /more than one "-"/],
      ["*/2/3 * * * *", /more than one "\/"/],
      ["* * * * FRI-MON", /ends before it starts/],
      ["@reboot", /isn't a known macro/],
      ["-1 * * * *", /minute field has ""/]
    ]
    for (const [text, message] of cases) assert.match(CronExpression.problem(text) ?? "valid", message, text)
  })
})
