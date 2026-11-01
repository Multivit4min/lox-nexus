import { z } from "@lox-nexus/plugin-sdk"

/** the schedule a row's button acts on, by key */
export const scheduleField = z.string().min(1).max(2000).meta({ title: "Schedule", description: "The schedule, as its row's button fills it in" })
