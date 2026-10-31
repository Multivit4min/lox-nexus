import { duration, secret, z } from "@lox-nexus/plugin-sdk"
import { CertificateFingerprint } from "./CertificateFingerprint.ts"
import { ConsoleAddress } from "./ConsoleAddress.ts"

/** Instance config: the console, its API key and site, polling, and how its certificate is checked. */
export const unifiConfigSchema = z.object({
  host: z.string().min(1).refine(ConsoleAddress.check, "an IP address, host name or https URL of the console").meta({
    title: "Console address",
    description: "IP address or host name of the UniFi console, e.g. 192.168.1.1. A URL with a path " +
      `replaces the API base ${ConsoleAddress.DEFAULT_BASE_PATH}, e.g. for a self-hosted Network server`
  }),
  apiKey: secret(z.string().min(1)).meta({
    title: "API key",
    description: "Created on the console under Settings › Control Plane › Integrations"
  }),
  site: z.string().default("").meta({
    title: "Site",
    description: "Name or id of the UniFi site. Empty: the console's first site (most consoles have just one, \"Default\")"
  }),
  pollInterval: duration({ unit: "s", min: 5, max: 3600 }).default(15).meta({
    title: "Poll every",
    description: "Seconds between two reads of clients and devices; at least 5"
  }),
  timeout: duration({ unit: "s", min: 1, max: 20 }).default(10).meta({
    title: "Timeout",
    description: "Seconds a single request to the console may take"
  }),
  fingerprint: z.string().regex(CertificateFingerprint.pattern, "64 hex digits, e.g. AB:CD:…").optional().meta({
    title: "Certificate fingerprint (SHA-256)",
    description: "Recommended: pin the console's self-signed certificate. Test connection shows the fingerprint " +
      "the console presents; compare it with the console's own before you paste it here"
  }),
  acceptAnyCertificate: z.boolean().default(false).meta({
    title: "Accept any certificate (insecure)",
    description: "Skips the certificate check for this console only. Anyone in the network path could read the " +
      "API key. Pin the fingerprint instead; a pinned fingerprint wins over this switch"
  })
})

export type UnifiConfig = z.infer<typeof unifiConfigSchema>
