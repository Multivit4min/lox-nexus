import type { WireDto, WirePreviewDto } from "@lox-nexus/api"
import { TransformSchema } from "@lox-nexus/core"
import { z } from "zod"

/** what the wire tools call: WireService, as the REST controller does */
export interface WireWrites {
  preview(input: unknown): WirePreviewDto
  create(input: unknown): WireDto
  update(id: string, input: unknown): WireDto
  delete(id: string): void
}

/** the steps as the tools take them, with a description the model reads */
export const TransformsInput = z.array(TransformSchema).max(50).describe(
  "applied in order, then the value is converted to the target's type. Steps: {op:\"invert\"}, " +
  "{op:\"scale\", from:[a,b], to:[c,d], clamp?}, {op:\"map\", cases:[{when:<value>, then:<value>}], else?}, " +
  "{op:\"debounce\", ms}, {op:\"throttle\", ms}, {op:\"convert\", to:<value type>}. " +
  "A value is {type:\"number\", value:3}, {type:\"boolean\", value:true}, {type:\"string\", value:\"x\"}, …"
)
