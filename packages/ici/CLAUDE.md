# packages/ici

Our own implementation of the Loxone Intercommunication Interface (replaces the `loxone-ici` npm
package). **No workspace imports, no runtime dependencies** beyond `node:` built-ins. Never logs:
everything is reported through typed events or return values.

- Protocol knowledge lives in `PROTOCOL.md`. Update it whenever a capture confirms or refutes a field.
- Lessons from the old library (each must have a regression test): `docs/loxone-ici-review.md`.
- Malformed datagrams must never throw out of the receive path.
- Unknown or unconfirmed bytes are preserved byte-exact and marked `@experimental`.
- Captures from real Miniservers go to `test/fixtures/` with a note on how they were produced.
