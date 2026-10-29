# Values

A **value** is what a signal carries. A sensor sends one with `emit()`, an actuator receives one in
`run()`, and Loxone Miniserver inputs and outputs use the same shapes. Every value is plain data: a
union tagged by `type`, so it can be copied between threads, compared structurally and stored.
Import it from `@lox-nexus/plugin-sdk/values`.

Most plugins only need `number`, `boolean` and `string`. The other types exist because Loxone
lights are driven with fade times, colours and button masks, and a plain number cannot carry those.

| `type` | Payload | Unit and range |
|---|---|---|
| `null` | none | |
| `boolean` | `value: boolean` | |
| `number` | `value: number` | any finite number |
| `string` | `value: string` | |
| `singleChannel` | `{ channel, fadeTime }` | `channel` 0-100 %; `fadeTime` seconds (a Loxone smart actuator dimmer) |
| `rgbw` | `{ red, green, blue, white, fadeTime, flags }` | channels 0-100 %; `fadeTime` seconds; `flags` raw bits (experimental) |
| `tunableWhite` | `{ temperature, brightness, fadeTime }` | `temperature` Kelvin (2700-6500 in conversions); `brightness` 0-100 %; `fadeTime` seconds |
| `t5` | `{ buttons }` | bitmask 0-31 of a Loxone Touch/T5 panel (experimental) |

## Creating values

`Value` is both a type and an object with one factory per type. Use the factory rather than writing
the object literal: the structured factories also normalise their input.

```ts
import { Value } from "@lox-nexus/plugin-sdk/values"

Value.boolean(true)
Value.number(21.5)
Value.string("on")
Value.null()
Value.singleChannel({ channel: 40, fadeTime: 1 })
Value.rgbw({ red: 100, green: 0, blue: 0, white: 0, fadeTime: 0.2, flags: 0 })
Value.tunableWhite({ temperature: 2700, brightness: 80, fadeTime: 2 })
Value.t5({ buttons: 1 })
```

A sensor sends the result with `this.emit(Value.number(watts))`. An actuator that `accepts` a type
receives that variant of the union.

### What the factories do to their input

`null`, `boolean`, `number` and `string` keep what you give them. The structured factories round to
what the wire to the Miniserver can carry:

- percent values (`channel`, `red`, `green`, `blue`, `white`, `brightness`) are rounded to whole
  percent and clamped to 0-100;
- `fadeTime` is limited to 0 to 6553.5 s in steps of 0.1 s (an invalid one becomes 0.2 s);
- `temperature` is rounded and clamped to 0 to 65535;
- `flags` is rounded and clamped to 0 to 65535;
- a `t5` mask that is not a whole number 0-31 becomes 0 (no button).

They never throw and never validate. For input from outside (HTTP, a device's JSON, persisted
data) check it with `ValueSchema`, which accepts only what a Miniserver can carry, or convert it with
`Converter`.

```ts
Value.singleChannel({ channel: 140, fadeTime: 0.04 })   // channel 100, fadeTime 0
```

### Comparing and the type guard

```ts
Value.equals(Value.number(1), Value.number(1))   // true: structural
Value.equals(Value.number(NaN), Value.number(NaN))   // true, so repeated NaN readings dedupe
Value.isType("rgbw")                              // true: a type guard for strings from outside
Value.types                                       // every type name, in a stable order
```

`equals` is what the bus uses to drop equal consecutive values, so you do not need to compare before
you `emit()`.

### Using the union in types

In type positions `Value` is the union, and `ValueOf<"rgbw">` is one variant:

```ts
import type { Value, ValueOf } from "@lox-nexus/plugin-sdk/values"

function brightness(value: ValueOf<"singleChannel">) {
  return value.value.channel
}
```

## Conversions

Signals declare a type, and the runtime converts to it, so your plugin rarely has to:

- an **actuator's `accepts`**: values are converted before `run()` is called;
- a **sensor's `valueType`**: what you `emit()` is converted to it before it reaches the bus;
- a **Miniserver signal's data type**, when a wire connects the two.

The conversion never throws. What cannot be converted becomes the target type's default (false, 0,
empty string, a light at 0 % with a 0.2 s fade), so a bad value cannot stall the bus. A value that
already has the target type is returned unchanged. You can call the converter yourself, for example
to predict what an actuator will receive, or to read a loosely typed value:

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

## Choosing types for your signals

- Declare `valueType` on sensors and `accepts` on actuators as exactly as you can. The wire editor
  hides targets and sources that would convert uselessly.
- Use `number` for measurements, `boolean` for states, `string` for text.
- Use `singleChannel`, `rgbw` and `tunableWhite` for lights that you want to drive with fade times.
  A plain number sent to a light type becomes a percentage.
- Use `"any"` only when the type varies (a generic "attribute" sensor).
- Pick the type the data *is*, not the one you expect the user to want. Wires convert for them: a
  `number` sensor can drive a Miniserver boolean input (true when non-zero).

An actuator that wants a number, whatever arrives:

```ts
export class SetpointActuator extends Actuator<MyPlugin, { id: string }, ValueOf<"number">> {
  static readonly id = "setpoint"
  static readonly accepts = "number"      // "21,5" or true or a dimmer all arrive as a number

  async run(value: ValueOf<"number">) {
    await this.plugin.api.setTemperature(this.params.id, value.value)
  }
}
```

## Helpers

These are small, stateless classes in the same import. Use them instead of rewriting the logic.

| Class | What it does |
|---|---|
| `ValueSchema`, `ValueTypeSchema` | zod schemas for validating untrusted values and type names. `ValueSchema` rejects `NaN` and `Infinity`, fractional percentages and out-of-range fields. |
| `ValueDefaults.for(type)` | A fresh default value of a type (what a failed conversion gives). `FADE_TIME` is 0.2 s, `TEMPERATURE` 4000 K. |
| `ValueFormatter` | A short display rendering for logs, panels and error messages: `42`, `true`, `"eco"` (strings are quoted), `60% 0.2s`. Lossy (numbers round to 3 decimals): never parse it. |
| `StringToNumber` | The lenient number parser behind conversions: `new StringToNumber().parse("1.234,5")` is 1234.5. Never returns `NaN`; unparseable gives 0. |
| `T5Buttons` | Names for the T5 bitmask: `new T5Buttons(5).names()` is `["left-upper", "middle"]`. Experimental. |
| `Numbers` | `clamp`, `percent`, `fade`, `scale`, `percentToHex`, all static. `Numbers.scale(v, 0, 1023, 0, 100)` maps a raw reading to percent; an empty source range gives the lower target instead of `NaN`. |

```ts
import { Numbers, Value, ValueFormatter } from "@lox-nexus/plugin-sdk/values"

const percent = Numbers.scale(raw, 0, 1023, 0, 100)
this.emit(Value.number(percent))
this.plugin.log.debug("emitted", { value: new ValueFormatter().format(Value.number(percent)) })
```

See the [values reference](../reference/sdk/@lox-nexus/plugin-sdk/values.md) for every signature, and
[SDK at a glance](sdk-at-a-glance.md#lox-nexusplugin-sdkvalues) for the compact list.
