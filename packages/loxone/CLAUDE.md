# packages/loxone

Loxone as a first-class part of Nexus: `Miniserver`, `MiniserverManager`, `DiscoveryList`. Maps
`packages/ici` packets to bus signals (`loxone/<miniserver>/in|out|discovered/<packetId>`).
May import `core` and `ici`, never `apps/*`.
