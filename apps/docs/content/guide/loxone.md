# Setting up a Miniserver

Nexus exchanges values with a Miniserver through **Network Intercommunication** (ICI), the same
mechanism Miniservers use among themselves. Nexus acts as one more peer. Values travel as UDP
datagrams with an 8-character **ID** per peer and a **packet ID** per value.

Loxone Config's menu names differ between versions; the settings below are what matters.

## What you need to agree on

| Setting | In Nexus | Meaning |
|---|---|---|
| Miniserver address | `host` | IP or host name of the Miniserver. |
| Miniserver ID | `remoteId` | The ID the Miniserver sends as (up to 8 characters). |
| Nexus ID | `ownId` | The ID you give Nexus as an intercommunication peer (up to 8 characters). |
| Miniserver port | `port` | Where Nexus sends. Default **61263**. |
| Nexus listen port | `listenPort` | Where the Miniserver sends to. Default **61263**. The port the peer is configured with in Loxone Config. |
| Listen address | `listenAddress` | Optional local IPv4 address to bind; default all interfaces. |
| Password | `password` | Optional; set it when the peer is configured as encrypted in Loxone Config. |
| Re-send interval | `resendInterval` | Milliseconds between re-sends of unchanged outputs, default 10 000; 0 turns re-sending off. |

IDs and packet IDs are at most 8 ASCII characters.

## Steps

1. In **Loxone Config**, add Nexus as an intercommunication peer: give it an ID (the `ownId`) and
   the address and port of the machine running Nexus (the `listenPort`).
2. Make sure the Miniserver can reach that address and port over UDP (no firewall in between), and
   that Nexus can reach the Miniserver's port.
3. In Nexus, open **Miniservers**, add the Miniserver with the settings above and enable it.
4. Check the health shown next to it:

   | Health | Meaning |
   |---|---|
   | stopped | Not running (disabled, or the start failed; the error is shown). |
   | waiting | Running, nothing received yet. |
   | online | Packets arrive. |
   | stale | Nothing received for 10 minutes. |

   UDP has no connection, so health comes from traffic: any data packet or status heartbeat from
   the Miniserver marks it online.

Several Miniservers may share one listen port. They then must differ in their `ownId` or
`remoteId`, otherwise Nexus cannot tell their packets apart and refuses the second one.

## Signals

A Miniserver's signals are its **packet IDs**:

- **Inputs** are values the Miniserver sends to Nexus, topic `loxone/<slug>/in/<packet>`. In Loxone
  Config these are the outputs of the intercommunication peer.
- **Outputs** are values Nexus sends to the Miniserver, topic `loxone/<slug>/out/<packet>`. They
  appear in Loxone Config as inputs of the peer.

Each packet ID can be used once per direction. A signal has a **data type**:

| Type | Value type in Nexus |
|---|---|
| Digital | boolean |
| Analog | number |
| Text | string |
| T5 | t5 (experimental) |
| RGBW | rgbw (smart actuator RGBW) |
| Single channel | singleChannel (smart actuator dimmer) |
| Tunable white | tunableWhite |

Incoming values are converted to the signal's declared type.

### Discovery

Inputs can be discovered: packets with an unknown packet ID appear under **discovered** with their
last value. **Adopt** one to turn it into an input; its data type comes from the packet. Values
seen while it was only discovered arrive once it is adopted. Outputs cannot be discovered, because
the Miniserver never says which packet IDs it expects. Add them by hand or import them.

### Importing from Loxone Config

**Import from Loxone Config** on a Miniserver's page reads the Loxone Config project and lists the
peer's objects as new, configured, type differs or unsupported type:

- from the Miniserver over FTP, with a Miniserver user that has the FTP right (the login is used
  once and never stored; repeated failed logins make the Miniserver block Nexus' address), or
- from a file: a `.Loxone` project, a Miniserver archive (`sps_….zip`) or a `.LoxCC`, up to 32 MB.

Names and descriptions come from the project. The import preselects the peer whose ID matches the
Miniserver's `ownId` and lists connection settings that differ from the project.

## Colours and Lumitech

A Loxone Lighting Controller output of type **Lumitech** sends the controller's own colour number
(for example `200504000`: 50 % brightness at 4000 K), not RGB bytes. Tick **Lumitech** on the
signal so Nexus decodes it. This option exists for:

- **Analog** signals (the number itself), and
- **RGBW inputs** (which may carry the number's bytes).

It gives exact colour temperatures. A *Smart* output goes through a table inside the Miniserver,
which loses the exact temperature.

## Load limit

Loxone documents a limit of an average of **35 messages per second over 2 minutes** for
intercommunication. Above that, delivery is no longer guaranteed and the Miniserver reports a
system message. Nexus shows the current load as a percentage on every Miniserver, with the last
hour as a chart. Re-sends add up: 100 outputs with the default 10 s interval are 10 messages per
second, 29 % of the limit. Nexus cannot see traffic between the Miniserver and other peers, so the
number is a lower bound. Raise the re-send interval or turn it off if you are close.

## Troubleshooting

- *Stays on "waiting"*: the Miniserver sends nothing to Nexus. Check the peer's address and port in
  Loxone Config, the firewall and the `listenPort`.
- *"decryption failed"* or *encrypted packet without a password*: the password differs from Loxone
  Config, or is missing.
- *Port in use*: another program listens on `listenPort`; use another port or share it with a
  Miniserver of Nexus.
- The **Bus Inspector** and `system/loxone/<slug>/error` show problems; each kind is reported at
  most once a minute.
