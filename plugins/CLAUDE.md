# plugins/

Each plugin is a self-contained package that **may import only `@lox-nexus/plugin-sdk`**, so it can
move to its own repository. A plugin ships a prebuilt ESM bundle declared in the `loxNexus`
manifest in its package.json.

- Integrations of the previous Nexus that aren't plugins yet are described in `docs/legacy-nexus.md`. Design fresh classes from that.
- Test with `PluginTestHost` from `@lox-nexus/plugin-sdk/testing`.
