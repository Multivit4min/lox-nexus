import type { Panel } from "@lox-nexus/plugin-sdk"

/** one titled part of a "sections" panel */
export type Section = Extract<Panel, { type: "sections" }>["sections"][number]
