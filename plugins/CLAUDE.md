# plugins/

Each plugin is a self-contained package that **may import only `@lox-nexus/plugin-sdk`**, so it can
move to its own repository. A plugin ships a prebuilt ESM bundle declared in the `loxNexus`
manifest in its package.json.

- Old behaviour reference: `old/loxone-nexus/src/integration/<name>/`. Design fresh classes; don't port line by line.
- Test with `PluginTestHost` from `@lox-nexus/plugin-sdk/testing`.
- Follow `/port-integration` when porting.
