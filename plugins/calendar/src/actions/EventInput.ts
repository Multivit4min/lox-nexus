import { z } from "@lox-nexus/plugin-sdk"

/** the input of the buttons on an event's row: the occurrence they act on */
export const eventInput = z.object({ event: z.string().min(1).max(2000).meta({ title: "Event", description: "The occurrence, as its row's button fills it in" }) })

export type EventInput = z.infer<typeof eventInput>
