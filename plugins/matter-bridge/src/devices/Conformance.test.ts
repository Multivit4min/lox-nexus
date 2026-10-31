import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { Endpoint, ServerNode } from "@matter/main"
import { AggregatorEndpoint } from "@matter/main/endpoints/aggregator"
import { Matter, type ClusterModel, type DeviceTypeModel, type RequirementModel } from "@matter/main/model"
import { MemoryStore } from "../test-support/MemoryStore.ts"
import { DeviceFactory } from "./DeviceFactory.ts"
import { DEVICE_TYPE_IDS, type DeviceTypeId } from "./DeviceKinds.ts"
import { DeviceMemory } from "./DeviceMemory.ts"

/**
 * Every device type of the bridge checked against the Matter specification as matter.js models
 * it: each device type an endpoint lists must have its mandatory server and client clusters, the
 * mandatory features, attributes and commands of those clusters, and the device types it must be
 * composed of (on the endpoint or one below it). matter.js already refuses a cluster that breaks
 * its own conformance; this covers what device types add on top.
 */

interface Described { deviceTypeList: readonly { deviceType: number }[]; serverList: readonly number[]; clientList: readonly number[] }

let node: ServerNode
let aggregator: Endpoint
const context = { now: () => 0, wait: async () => {}, warn() {}, memory: new DeviceMemory(new MemoryStore()) }

before(async () => {
  node = await ServerNode.create({ id: "conformance", network: { port: 0 }, commissioning: { enabled: false } } as never)
  aggregator = new Endpoint(AggregatorEndpoint, { id: "devices" })
  await node.add(aggregator)
})
after(() => node.close())

const camel = (name: string) => name.charAt(0).toLowerCase() + name.slice(1)
const mandatory = (requirement: { conformance: unknown }) => String(requirement.conformance) === "M"
const cluster = (name: string) => Matter.clusters.find(candidate => candidate.name === name) as ClusterModel

/** what a device type requires of an endpoint that is missing */
function missing(endpoint: Endpoint, type: DeviceTypeModel, all: readonly Endpoint[]): string[] {
  const described = endpoint.state.descriptor as unknown as Described
  const behaviors = endpoint.behaviors.supported as Record<string, { features?: Record<string, boolean> } | undefined>
  const problems: string[] = []
  for (const requirement of type.children.filter((child): child is RequirementModel => child.tag === "requirement" && mandatory(child))) {
    const where = `${type.name}: ${requirement.name}`
    if (requirement.element === "deviceType") {
      const id = Matter.deviceTypes.find(candidate => candidate.name === requirement.name)?.id
      if (id === undefined || !all.some(part => (part.state.descriptor as unknown as Described).deviceTypeList.some(entry => entry.deviceType === id))) problems.push(`${where} device type`)
      continue
    }
    if (requirement.element !== "serverCluster" && requirement.element !== "clientCluster") continue
    const model = cluster(requirement.name)
    if (model.id === undefined) continue
    const list = requirement.element === "serverCluster" ? described.serverList : described.clientList
    if (!list.includes(model.id)) {
      problems.push(`${where} ${requirement.element === "serverCluster" ? "server" : "client"} cluster`)
      continue
    }
    if (requirement.element === "clientCluster") continue
    const behavior = behaviors[camel(requirement.name)]
    const state = (endpoint.state as unknown as Record<string, Record<string, unknown>>)[camel(requirement.name)] ?? {}
    for (const element of (requirement.children ?? []).filter(mandatory)) {
      if (element.tag === "requirement" && (element as RequirementModel).element === "feature") {
        const title = model.featureMap.children.find(feature => feature.name === element.name)?.title ?? element.name
        if (!behavior?.features?.[camel(title)]) problems.push(`${where} feature ${title}`)
      } else if ((element as RequirementModel).element === "attribute") {
        if (state[camel(element.name)] === undefined) problems.push(`${where} attribute ${element.name}`)
      } else if ((element as RequirementModel).element === "command") {
        const commands = (behavior as unknown as { cluster?: { commands?: Record<string, unknown> } })?.cluster?.commands ?? {}
        if (!(camel(element.name) in commands)) problems.push(`${where} command ${element.name}`)
      }
    }
  }
  return problems
}

for (const type of DEVICE_TYPE_IDS) {
  test(`${type} has what Matter requires of its device types`, async () => {
    const device = new DeviceFactory(context).create({ id: type, name: type, type: type as DeviceTypeId, allowUnlock: false, battery: true })
    await aggregator.add(device.endpoint)
    const endpoints = [device.endpoint, ...device.endpoint.parts]
    const problems = endpoints.flatMap(endpoint => {
      const listed = (endpoint.state.descriptor as unknown as Described).deviceTypeList
      return listed.flatMap(({ deviceType }) => {
        const model = Matter.deviceTypes.find(candidate => candidate.id === deviceType)
        return model ? missing(endpoint, model, endpoints) : [`unknown device type ${deviceType}`]
      })
    })
    await device.endpoint.delete()
    assert.deepEqual(problems, [])
  })
}

test("the check finds what is missing: an on/off light is no thermostat and no doorbell", async () => {
  const light = new DeviceFactory(context).create({ id: "light", name: "light", type: "on-off-light", allowUnlock: false, battery: false })
  await aggregator.add(light.endpoint)
  const of = (name: string) => missing(light.endpoint, Matter.deviceTypes.find(candidate => candidate.name === name)!, [light.endpoint])
  assert.deepEqual(of("Thermostat"), ["Thermostat: Thermostat server cluster"])
  assert.deepEqual(of("Doorbell"), ["Doorbell: Switch server cluster", "Doorbell: Chime client cluster"])
  assert.deepEqual(of("SolarPower"), ["SolarPower: PowerSource device type", "SolarPower: ElectricalSensor device type"])
  await light.endpoint.delete()
})
