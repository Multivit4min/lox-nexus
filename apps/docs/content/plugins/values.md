# Values

Every value on the bus is a `Value`: plain data, a union tagged by `type`. Import it from
`@lox-nexus/plugin-sdk/values`.

| `type` | Payload | Unit and range |
|---|---|---|
| `null` | none | |
| `boolean` | `value: boolean` | |
| `number` | `value: number` | any finite number |
| `string` | `value: string` | |
| `singleChannel` | `{ channel, fadeTime }` | `channel` 0-100 %; `fadeTime` seconds (a Loxone smart actuator dimmer) |
| `rgbw` | `{ red, green, blue, white, fadeTime, flags }` | channels 0-100 %; `fadeTime` seconds; `flags` raw bits (experimental) |
| `tunableWhite` | `{ temperature, brightness, fadeTime }` | `temperature` Kelvin (2700-6500 in conversions); `brightness` 0-100 %; `fadeTime` seconds (experimental unit) |
| `t5` | `{ buttons }` | bitmask 0-31 of a Loxone Touch/T5 panel (experimental) |

## Creating values

```ts
import { Value } from "@lox-nexus/plugin-sdk/values"

Value.boolean(true)
Value.number(21.5)
Value.string("on")
Value.null()
Value.singleChannel({ channel: 40, fadeTime: 1 })
Value.rgbw({ red: 100, green: 0, blue: 0, white: 0, fadeTime: 0.2, flags: 0 })
Value.tunableWhite({ temperature: 2700, brightness: 80, fadeTime: 2 })
Value.equals(Value.number(1), Value.number(1))   // true
```

The structured factories round to what the wire carries: whole percent (clamped to 0-100) and 0.1 s
fade steps. They do not validate; use `ValueSchema` for untrusted input.

In type positions `Value` is the union, and `ValueOf<"rgbw">` is one variant:

```ts
import type { Value, ValueOf } from "@lox-nexus/plugin-sdk/values"

function brightness(value: ValueOf<"singleChannel">) {
  return value.value.channel
}
```

## Conversions

Wires and the runtime convert values to the type a signal declares: an actuator's `accepts`, a
sensor's `valueType`, a Miniserver signal's data type. The conversion never throws; what cannot be
converted becomes the target type's default (false, 0, empty string, a light at 0 % with a 0.2 s
fade). You can call it yourself:

```ts
import { Converter, Value } from "@lox-nexus/plugin-sdk/values"

Converter.convert(Value.string("on"), "boolean")       // { type: "boolean", value: true }
Converter.convert(Value.string("20%"), "number")       // { type: "number", value: 0.2 }
Converter.convert(Value.number(60), "singleChannel")   // 60 %, fade 0.2 s
```

| To | From | Result |
|---|---|---|
| `boolean` | number | true when non-zero |
| | string | true for "on"-like words (`on`, `true`, `1`, `ok`, `active`, `open`, `unlocked`, `running`, `armed`, `playing`, `heating`, ...), otherwise false |
| | light, t5 | true when anything is lit or pressed |
| `number` | boolean | 1 or 0 |
| | string | parsed leniently: `"20%"` is 0.2, `"1.234,5"` is 1234.5, `"12,5"` is 12.5, unparseable is 0 |
| | singleChannel, tunableWhite | channel or brightness |
| | rgbw | colour packed as `0xRRGGBBWW` |
| | t5 | the button mask |
| `string` | anything | a readable rendering: `"true"`, `"0.3"` (numbers rounded to 5 decimals), `"50% 0.2s"`, `"#ff000000 0.2s"`, `"left-upper+middle"` |
| `singleChannel`, `tunableWhite` | number | percent of brightness (clamped 0-100); `tunableWhite` uses 4000 K |
| | boolean | 100 or 0 |
| | string | parsed like number |
| | rgbw | average of the channels (`singleChannel`), or white as brightness with a temperature estimated from the tint (`tunableWhite`) |
| `rgbw` | number, boolean, string | drives the **white** channel only |
| | singleChannel, tunableWhite | white channel with their fade time |
| `t5` | whole number 0-31 | the mask; everything else means no button |
| `null` | anything | null |

A value that already has the target type is returned unchanged.

## Choosing types for your signals

- Declare `valueType` on sensors and `accepts` on actuators as exactly as you can. The wire editor
  hides targets and sources that would convert uselessly.
- Use `number` for measurements, `boolean` for states, `string` for text.
- Use `singleChannel`, `rgbw` and `tunableWhite` for lights that you want to drive with fade times.
  A plain number sent to a light type becomes a percentage.
- Use `"any"` only when the type varies (a generic "attribute" sensor).

## Helpers

| Class | Purpose |
|---|---|
| `ValueSchema`, `ValueTypeSchema` | zod schemas for validating untrusted values and type names |
| `ValueDefaults.for(type)` | The default value of a type |
| `ValueFormatter` | A short display rendering; lossy, never parse it |
| `StringToNumber` | The lenient number parser |
| `T5Buttons` | Names for the T5 bitmask (experimental) |
| `Numbers` | `clamp`, `percent`, `fade`, `scale`, `percentToHex` |

See the [values reference](../reference/sdk/@lox-nexus/plugin-sdk/values.md).
