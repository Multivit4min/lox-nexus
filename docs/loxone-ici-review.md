# loxone-ici review

Review of the `loxone-ici` npm package (github.com/Multivit4min/loxone-intercommunication, commit
161eece, v0.1.1), written while planning the rewrite. Lox Nexus no longer uses the package: it is
replaced by `packages/ici`. **Each item below must have a regression test in `packages/ici`.**
The items can also be filed as issues upstream.

Line references point at the upstream repository. `loxone-nexus/…` references point at the previous Nexus (github.com/Multivit4min/loxone-nexus).

**Bugs**
1. **Payload length mismatch.** `toBuffer` in both `LoxoneInput` and `LoxoneOutput` writes the payload
   length with `writeUint8(…, 35)`, but reading uses `readUint16LE(35)`. TEXT longer than 255 bytes
   gets a corrupted length.
2. **No length validation on incoming packets.** An empty or short UDP datagram throws inside the
   `message` handler. The exception is uncaught, so anyone who can reach the port can crash the
   process.
3. **`bind()` failures crash the process.** `bind()` never rejects and the socket has no `error`
   listener, so `EADDRINUSE` becomes an unhandled `error` event. Old Nexus also doesn't await
   `bind` (`loxone-nexus/src/loxone/LoxoneInstance.ts:93`).
4. **The server can't be restarted.** `LoxoneServer.server` is a socket created once as a `readonly`
   field, so it can't be rebound after `close()`. `close()` also strips every listener, and each
   `bind()` call adds another `message` handler.
5. **TunableWhite listeners never fire.** `LoxoneInputListener.smartActuatorTunableWhite()` registers
   into the SingleChannel bucket (lines 67-68). There is also no public `t5()`, and
   `risingEdge`/`fallingEdge` pass `null`.
6. **`lastValue` uses `===`.** Object payloads never dedupe, and a RegExp listener shares one
   `lastValue` across every packetId it matches.
7. **`SmartRGBWOutput.setPartial` always throws.** It runs the full validator on the partial object.
8. **`T5Output.isTypeValid` lets `null` through.** `typeof value !== null` is always true, so `null`
   passes the check and then throws a TypeError.
9. **`sendOnce()` leaks a timer.** It starts a 10 s resend interval that is never stopped, and it
   doesn't actually send.
10. **Timers keep running after `close()`.** `Output.send()` re-arms the interval, so `setValue()`
    after `close()` produces unhandled `ERR_SOCKET_DGRAM_NOT_RUNNING` errors. The timers are not
    `unref()`'d either.
11. **Data type is guessed from the value's shape.** `send()` doesn't use the output's own type. There
    is also no TunableWhite output class.
12. **Sends can hang forever.** If `connect()` fails, `connectedResolve` never resolves and every
    send waits forever. `sendBuffer` is never awaited, so its errors go unhandled.

**Protocol and correctness**

13. **No ID filtering.** Incoming packets are not filtered by `targetId === ownId` or by `sourceId`.
    Dedup is keyed only by packetId, so two Miniservers that use the same packetId interfere.
14. **IDs over 8 bytes are silently truncated**, possibly in the middle of a UTF-8 character.
15. **Range checks are loose.** `isValidRange` uses max 101 (should be 100), and non-integer values
    are not rejected before `writeUint8`.
16. **TunableWhite fade time.** PROTOCOL.md says 0.2 s units, the code uses 0.1 s. The PROTOCOL.md
    table also gives the packetId as bytes 26–34, which overlaps the next field.
17. **`DigitalOutput.triggerHigh/Low` timers** race with each other and are not cleared on `stop()`.

**API and packaging**

18. **`createOutput(id, type: DATA_TYPE)` forces `@ts-ignore`.** Consumers need it
    (`loxone-nexus/src/loxone/LoxoneInstance.ts:154`); a generic `OutputFor<T>` return type would fix that.
    `setValue()` already sends, so Nexus's extra `.send()` sends every value twice.
19. **EventEmitter usage.** It is imported from `"stream"` instead of `node:events`. The typed
    `EventEmitter<Events>` generic would be cleaner.
20. **Unknown packets go to `console.debug`.** A library shouldn't log. Emit an event instead. The
    0x8D status packet could be used as a heartbeat, and 0x9F encryption is documented but not
    implemented.
21. **Packaging.** There is no `exports` map, and the build targets es2016 with CommonJS.
22. **Tests.** There is one round-trip test. Nothing covers output encoding, the server, the
    listeners or malformed input.


## Regression coverage in packages/ici

| # | Covered by | Notes |
|---|---|---|
| 1 | `PayloadCodecs.test` "text round-trips beyond 255 bytes", `PacketEncoder.test` "uint16", `PacketDecoder.test` "byte-exact" | |
| 2 | `PacketDecoder.test` "malformed" and "never throws", `IciReceiver.test` "junk" | |
| 3 | `IciSocket.test` "EADDRINUSE", "runtime socket errors become socketError" | Runtime errors are emitted as `socketError`, which can't crash the process. `IciReceiver` also catches throwing listeners (`listenerError`) |
| 4 | `IciSocket.test` "rebinding does not duplicate datagram events", "close during bind", "second bind" | |
| 5 | n/a | No per-type listener buckets. `IciReceiver` emits one `data` event with the value decoded by the codec table, and every codec has round-trip tests |
| 6 | `IciReceiver.test` "repeats as unchanged", "two Miniservers with the same packet id", "bounds memory" | Byte-equality per (source, packet id), bounded to 4096 entries by default |
| 7 | n/a | No partial setters; values are complete objects |
| 8 | `PayloadCodecs.test` "t5 rejects null" | |
| 9 | `RemotePeer.test` "resends all outputs with a value" | One scheduler; outputs without a value are never sent |
| 10 | `RemotePeer.test` "close stops resends", `IciSocket.test` "send after close" | The resend timer is `unref()`'d, and a NaN interval is rejected |
| 11 | `RemotePeer.test` "type byte on the wire comes from the output", "type clashes" | TunableWhite has a codec |
| 12 | `RemotePeer.test` "failed resends as events", `IciSocket.test` "send after close", "a send still in flight is rejected by close" | No connect step, and in-flight sends are rejected on close instead of hanging |
| 13 | `IciReceiver.test` "ours and foreign", "source id" | Confirmed necessary by live captures (`red` traffic) |
| 14 | `IciId.test`, `PacketEncoder.test` "ids that don't fit" | |
| 15 | `PayloadCodecs.test` "out-of-range and fractional" | |
| 16 | `PayloadCodecs.test` "0.1 s fade units (live capture)" | Confirmed for RGBW. TunableWhite stays experimental (see backlog) |
| 17 | n/a | No pulse helpers in the protocol library; pulses belong to higher layers |
| 18 | `RemotePeer.test` "exactly once", typed `output<T>()` | |
| 19 | by construction | Typed `EventEmitter<Events>` from `node:events` |
| 20 | `PacketDecoder.test` "unknown control bytes", "raw datagram", status fixture test, `IciCipher.test` | Never logs. 0x8D decoded. 0x9F implemented (experimental), and a wrong password is rejected structurally |
| 21 | partly | Exports map with source and dist conditions. Publishing happens in M6 |
| 22 | 64 tests in `packages/ici` | Including live-capture fixtures and seeded fuzzing |
