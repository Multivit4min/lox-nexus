import type { JsonSchemaNode } from "./SchemaField.ts"

type Primitive = string | number | boolean

/** A discriminated union as zod writes it: a oneOf of objects that share one property with fixed values. */
export interface UnionShape {
  discriminator: string
  /** the discriminator as a field: the title and description of the first enum branch that has them */
  label?: string
  description?: string
  branches: Array<{ node: JsonSchemaNode; values: Primitive[]; labels: Record<string, string> }>
}

/** Finds the discriminator of a union, so the form can offer it as a choice and show one branch at a time. */
export class SchemaUnion {
  /** undefined for anything else: other unions stay JSON */
  static detect(node: JsonSchemaNode): UnionShape | undefined {
    const branches = node.oneOf ?? node.anyOf
    if (!branches || branches.length < 2 || !branches.every(branch => branch.type === "object" && branch.properties)) return undefined
    const names = Object.keys(branches[0]!.properties!)
    for (const name of names) {
      const shapes = branches.map(branch => SchemaUnion.valuesOf(branch.properties![name]))
      if (shapes.some(shape => !shape)) continue
      const all = shapes.flatMap(shape => shape!.values)
      if (new Set(all.map(String)).size !== all.length) continue
      // a literal's title names its value; an enum's titles the field
      const described = branches.map(branch => branch.properties![name]!).find(property => property.enum && (property.title || property.description))
      return {
        discriminator: name,
        ...(described?.title ? { label: described.title } : {}),
        ...(described?.description ? { description: described.description } : {}),
        branches: branches.map((branch, i) => ({ node: branch, ...shapes[i]! }))
      }
    }
    return undefined
  }

  // a literal names its one value by its title, an enum its values by enumLabels
  private static valuesOf(property: JsonSchemaNode | undefined): { values: Primitive[]; labels: Record<string, string> } | undefined {
    if (!property) return undefined
    if (SchemaUnion.isPrimitive(property.const)) return { values: [property.const], labels: property.title ? { [String(property.const)]: property.title } : {} }
    if (Array.isArray(property.enum) && property.enum.length > 0 && property.enum.every(SchemaUnion.isPrimitive)) {
      return { values: property.enum, labels: { ...property.enumLabels } }
    }
    return undefined
  }

  private static isPrimitive(value: unknown): value is Primitive {
    return ["string", "number", "boolean"].includes(typeof value)
  }
}
