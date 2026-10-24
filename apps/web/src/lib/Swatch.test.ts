import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { Swatch } from "./Swatch.ts"

test("RGBW includes white; a colour temperature is warm or cool and dims with its brightness", () => {
  assert.equal(Swatch.of(Value.rgbw({ red: 0, green: 0, blue: 0, white: 80, fadeTime: 0, flags: 0 })), "rgb(204 204 204)")
  const warm = Swatch.kelvin(2200)
  const cool = Swatch.kelvin(6500)
  assert.ok(warm[0] > warm[2] && cool[2] > warm[2], `warm ${warm}, cool ${cool}`)
  assert.equal(Swatch.of(Value.tunableWhite({ temperature: 6600, brightness: 100, fadeTime: 0 })), "rgb(255 255 255)")
  assert.equal(Swatch.of(Value.tunableWhite({ temperature: 6600, brightness: 0, fadeTime: 0 })), "rgb(64 64 64)")
  assert.equal(Swatch.of(Value.number(3)), undefined)
})
