import type { PluginInstanceDto, PluginReadmeDto } from "@lox-nexus/api"
import { z } from "zod"
import { SecretFields } from "../../../plugins/SecretFields.ts"
import type { McpTool } from "../../McpTool.ts"
import type { PluginRefs } from "./PluginRefs.ts"

const Input = z.object({
  plugin: z.string().min(1).max(100).describe("the plugin's id (e.g. homeassistant) or an instance's slug"),
  readme: z.boolean().default(true).describe("include the README (cut at 32 KB)")
})

const README_MAX = 32 * 1024

/** What a plugin offers: its settings, sensors, actuators and actions as JSON Schema, and its README. */
export class DescribePluginTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "describe_plugin"
  readonly title = "Describe a plugin"
  readonly description = "What a plugin offers: its settings (secretFields are entered by a person in the web UI, never by you), the sensors and actuators with their params as JSON Schema, its actions, its instances, and its README, which says how to set it up."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true, idempotentHint: true }
  readonly input = Input

  constructor(private readonly refs: PluginRefs, private readonly plugins: { list(): PluginInstanceDto[] }, private readonly readmes: { readme(id: string): PluginReadmeDto | undefined }) {}

  run(input: z.infer<typeof Input>) {
    const pkg = this.refs.package(input.plugin)
    const { config, sensors, actuators, actions = [] } = pkg.description
    const readme = input.readme ? this.readmes.readme(pkg.id)?.markdown : undefined
    return {
      id: pkg.id,
      name: pkg.name,
      version: pkg.version,
      instances: this.plugins.list().filter(instance => instance.plugin === pkg.id).map(({ slug, label, state }) => ({ slug, label, state })),
      config: DescribePluginTool.redacted(config),
      secretFields: new SecretFields(config).secretNames,
      sensors: sensors.map(sensor => ({ ...sensor, params: DescribePluginTool.redacted(sensor.params) })),
      actuators: actuators.map(actuator => ({ ...actuator, params: DescribePluginTool.redacted(actuator.params) })),
      actions: actions.map(({ id, label, description, input: form }) => ({ id, label, ...(description ? { description } : {}), input: form })),
      ...(readme === undefined ? {} : { readme: readme.length > README_MAX ? `${readme.slice(0, README_MAX)}\n… cut at 32 KB` : readme })
    }
  }

  // a secret field's default or examples would show the very value it hides
  private static redacted(schema: Record<string, unknown>): Record<string, unknown> {
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
    if (!properties) return schema
    const fields = Object.entries(properties).map(([name, field]) => {
      if (field.writeOnly !== true) return [name, field] as const
      const rest = { ...field }
      for (const key of ["default", "examples", "const", "enum"]) delete rest[key]
      return [name, rest] as const
    })
    return { ...schema, properties: Object.fromEntries(fields) }
  }
}
