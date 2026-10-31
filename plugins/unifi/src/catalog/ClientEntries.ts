import type { CatalogEntry, CatalogNode } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Client } from "../api/ApiSchemas.ts"
import { MacAddress } from "../api/MacAddress.ts"
import type { NetworkSnapshot } from "../poll/NetworkSnapshot.ts"
import { GuestAccessActuator } from "../actuators/GuestAccessActuator.ts"
import { ClientConnectedSensor } from "../sensors/ClientConnectedSensor.ts"
import { ClientIpSensor } from "../sensors/ClientIpSensor.ts"
import { ClientUplinkSensor } from "../sensors/ClientUplinkSensor.ts"

/** The catalog's clients: the connected ones (the API lists no others), each by MAC and by name. */
export class ClientEntries {
  constructor(private readonly snapshot: NetworkSnapshot) {}

  node(): CatalogNode {
    const children = [...this.snapshot.clients].sort((a, b) => a.name.localeCompare(b.name)).map(client => ({
      label: client.macAddress ? `${client.name} (${MacAddress.normalize(client.macAddress)})` : `${client.name} (${client.type.toLowerCase()})`,
      entries: this.entries(client)
    }))
    return { label: "Clients (connected now)", children }
  }

  private entries(client: Client): CatalogEntry[] {
    const entries: CatalogEntry[] = []
    // by MAC is the default; by name survives the rotating private addresses of iPhones
    if (client.macAddress) entries.push(...this.forMatch(client, { client: MacAddress.normalize(client.macAddress), matchBy: "mac" }, ""))
    entries.push(...this.forMatch(client, { client: client.name, matchBy: "name" }, " (by name)"))
    return entries
  }

  private forMatch(client: Client, params: { client: string; matchBy: "mac" | "name" }, suffix: string): CatalogEntry[] {
    const entries: CatalogEntry[] = [
      { kind: "sensor", capability: ClientConnectedSensor.id, params, label: `${client.name} connected${suffix}`, value: Value.boolean(true) },
      { kind: "sensor", capability: ClientUplinkSensor.id, params, label: `${client.name} connected to${suffix}`, value: Value.string(this.snapshot.uplinkOf(client)) },
      { kind: "sensor", capability: ClientIpSensor.id, params, label: `${client.name} IP address${suffix}`, value: Value.string(client.ipAddress ?? "") }
    ]
    if (client.access.type === "GUEST") {
      entries.push({ kind: "actuator", capability: GuestAccessActuator.id, params, label: `${client.name} guest access${suffix}`, value: Value.boolean(client.access.authorized === true) })
    }
    return entries
  }
}
