import { z } from "@lox-nexus/plugin-sdk"

/** What the user fills in when adding an instance: one instance per plug. */
export const smartPlugConfig = z.object({
  address: z.url({ protocol: /^https?$/ }).meta({
    title: "Address",
    description: "The plug's address, e.g. http://192.168.1.60 (the fake plug says it when it starts)"
  }),
  pollSeconds: z.number().min(1).max(3600).default(5).meta({
    title: "Read every (seconds)",
    description: "Seconds between two readings of the plug"
  })
})

export type SmartPlugConfig = z.infer<typeof smartPlugConfig>
