# loxone-ici review

Review of the `loxone-ici` npm package (github.com/Multivit4min/loxone-intercommunication, commit
161eece, v0.1.1), written while planning the rewrite. Lox Nexus no longer uses the package: it is
replaced by `packages/ici`. **Each item below must have a regression test in `packages/ici`.**
The items can also be filed as issues upstream.

Line references point at the upstream repository. `old/…` references point at the previous Nexus.

**Bugs**
1. **Payload length mismatch.** `toBuffer` in both `LoxoneInput` and `LoxoneOutput` writes the payload
   length with `writeUint8(…, 35)`, but reading uses `readUint16LE(35)`. TEXT longer than 255 bytes
   gets a corrupted length.
2. **No length validation on incoming packets.** An empty or short UDP datagram throws inside the
   `message` handler. The exception is uncaught, so anyone who can reach the port can crash the
   process.
3. **`bind()` failures crash the process.** `bind()` never rejects and the socket has no `error`
   listener, so `EADDRINUSE` becomes an unhandled `error` event. Old Nexus also doesn't await
   `bind` (`old/loxone-nexus/src/loxone/LoxoneInstance.ts:93`).
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
    (`old/loxone-nexus/src/loxone/LoxoneInstance.ts:154`); a generic `OutputFor<T>` return type would fix that.
    `setValue()` already sends, so Nexus's extra `.send()` sends every value twice.
19. **EventEmitter usage.** It is imported from `"stream"` instead of `node:events`. The typed
    `EventEmitter<Events>` generic would be cleaner.
20. **Unknown packets go to `console.debug`.** A library shouldn't log. Emit an event instead. The
    0x8D status packet could be used as a heartbeat, and 0x9F encryption is documented but not
    implemented.
21. **Packaging.** There is no `exports` map, and the build targets es2016 with CommonJS.
22. **Tests.** There is one round-trip test. Nothing covers output encoding, the server, the
    listeners or malformed input.

