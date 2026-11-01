# Catalog: browse and add

Read this when the device can list what it has, so the user picks signals instead of typing ids.

A catalog is a tree of ready-to-add signals. It saves the user from typing entity ids and paths:
they browse your device's own structure and add many signals at once. Offer one when the device can
list what it has (a Home Assistant's entities, an inverter's meters).

`catalog()` is asked on demand, when the user browses what to add, so it may query the device. A
throw is shown to the user. It must answer within 30 seconds, and with at most 16 MiB of JSON.

```ts
import type { CatalogNode } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"

override catalog(): CatalogNode[] {
  return [{
    label: "Kitchen",
    children: [{
      label: "Light",
      entries: [
        { kind: "sensor", capability: "state", params: { entityId: "light.kitchen" }, label: "Kitchen light", value: Value.number(42), unit: "%" },
        { kind: "actuator", capability: "switch", params: { id: "light.kitchen" }, label: "Kitchen light switch" }
      ]
    }]
  }]
}
```

- A **node** has a `label` and `children`, `entries`, or both. Nodes are for navigation only. An
  optional `id` (unique within the catalog, e.g. `client:<mac>`) lets the panel point at it: see
  "Signals" buttons in [Panel](panel.md).
- An **entry** names a capability by its static `id` and carries `params` that are validated against
  that capability's `params` schema when it is added. `label` is the suggested signal name.
- `value` and `unit` are optional. They show what the entry reads right now while the user browses
  (for an actuator: the state it would change), so give them whenever the data is at hand. Send the
  value the sensor would emit. The unit is the device's own, at most 32 characters. Both are only
  informative: an invalid value or a longer unit is dropped instead of failing the catalog.
