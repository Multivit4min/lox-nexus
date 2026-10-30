import assert from "node:assert/strict"
import { test } from "node:test"
import { StringToNumber } from "./StringToNumber.ts"

/** golden expectations from tests/conversion/stringToNumber.spec.ts of the previous Nexus (github.com/Multivit4min/lox-nexus/tree/legacy) */
const parse = (text: string) => new StringToNumber().parse(text)

test("garbage becomes 0", () => {
  for (const text of ["GARBAGE", "123NumberGarbage", "12_3% NumberGarbage", "12_3€ NumberGarbage", "$12_3€", ""]) {
    assert.equal(parse(text), 0, text)
  }
})

test("currency", () => {
  assert.equal(parse("123€"), 123)
  assert.equal(parse("12_3.5€"), 123.5)
  assert.equal(parse("$123"), 123)
  assert.equal(parse("$12_3.5"), 123.5)
})

test("plain numbers and percentages", () => {
  assert.equal(parse("2_000"), 2000)
  assert.equal(parse(" 0.03 "), 0.03)
  assert.equal(parse(" -0.15 "), -0.15)
  assert.equal(parse("20%"), 0.2)
  assert.equal(parse(" 1_2.5% "), 0.125)
})

test("thousand separators and decimal commas", () => {
  assert.equal(parse("1.234,5"), 1234.5)
  assert.equal(parse("1,234.5"), 1234.5)
  assert.equal(parse("12,5"), 12.5)
  assert.equal(parse("1,234,567"), 1234567)
  assert.equal(parse("1.234.567"), 1234567)
  assert.equal(parse("20 €"), 20)
})

test("a single separator is a decimal point (deliberate change: the old code read \"0.125\" as 125)", () => {
  assert.equal(parse("0.125"), 0.125)
  assert.equal(parse("0.250 kW".replace(" kW", "")), 0.25)
  assert.equal(parse("12.500"), 12.5)
  assert.equal(parse("0,125"), 0.125)
})
