# 2. A first plugin

In this step you create the plugin package, make an empty plugin appear in Nexus, and then give it
settings with a **Test connection** button. You see your plugin in the **Add instance** dialog and
a green message from the fake plug.

## Create the package

Every directory of `plugins/` is a workspace package, and the development server runs each one.
Create `plugins/smart-plug/` with two files.

`plugins/smart-plug/package.json` is the one of the finished example. Copy it and change two things:

- `name` to `@lox-nexus/plugin-smart-plug` (the example's name is taken, and two workspaces must not
  share one).
- Drop the `fake-plug` script and the `tsx` it needs; that script belongs to the fake plug, which
  you run from the example.

<!--@code: ../../../../../examples/smart-plug/package.json-->

`plugins/smart-plug/tsconfig.json`:

<!--@code: ../../../../../examples/smart-plug/tsconfig.json-->

Then run `npm install` at the repository root once, so the workspace knows the new package.

The `loxNexus` block is what makes it a Nexus plugin:

- **`id`** is the plugin's topic segment and its stable reference: the signals of your plugin live
  under `smart-plug/<instance>/…`. **Never change it after you hand out the plugin**, because every
  instance and signal is stored with it.
- **`name`** and **`icon`** are what the user sees. The icon is one of a short list, see
  [the manifest](../publishing.md#the-manifest).
- **`entry`** is the built bundle. It only matters when you install the plugin (step 6): in
  development, Nexus runs `src/index.ts` instead.

The `build` script and `dependencies` are the same in every plugin. The SDK is a workspace package,
so `"*"` resolves to the one in your checkout.

## Write an empty plugin

A plugin has two source files to begin with. Until both exist, the terminal running `npm run dev`
logs *skipping a development plugin that can't be loaded*. That is expected; it stops once the
second file is saved. `plugins/smart-plug/src/index.ts` is the same for every
plugin:

<!--@code: ../../../../../examples/smart-plug/src/index.ts-->

`PluginEntry.define()` is the only line that connects your class to Nexus. When Nexus loads the file
in a worker, it starts the runtime. When anything else imports it (a test), it just hands back the
class.

`plugins/smart-plug/src/SmartPlugPlugin.ts` is the plugin itself. For now it only writes a line to
the log:

```ts
import { Plugin } from "@lox-nexus/plugin-sdk"

export class SmartPlugPlugin extends Plugin {
  override start() {
    this.log.info("hello from the smart plug plugin")
  }
}
```

`start()` runs once each time an instance of the plugin starts. `this.log` is the instance's log.

## See it in Nexus

The terminal that runs `npm run dev` logs `plugin changed, restarting its instances` shortly after
you save. The log is JSON, one object per line, so look for that text inside a line. Then, in the web interface:

1. Open **Plugins** and press **Add instance**. The dialog **Add plugin instance** opens.
2. Under **Plugin** choose **Smart plug · 0.1.0**. That is your plugin: its name and version come
   from `package.json`.
3. Give it the **Name** `Desk lamp`. Under **Advanced**, **Topic name** is made from the name:
   `desk-lamp`, shown as `smart-plug/desk-lamp/…`.
4. Press **Add instance**.

You land on the instance's page. Its title is *Desk lamp* with the badge **running**, and under it
`smart-plug/desk-lamp · Smart plug 0.1.0`. The **Log** card at the bottom shows the line
*hello from the smart plug plugin*.

If **Smart plug** isn't in the list, look at the terminal that runs `npm run dev`: a plugin that
fails to load (a typo in `package.json`, a missing `src/index.ts`) is logged there and skipped. Save
a file of the plugin again once you have fixed it.

**What just happened.** You added an *instance*: your plugin configured once. Nexus started a
worker thread for it, loaded your module, built the `SmartPlugPlugin` object and called `start()`.
Other instances of the same plugin would each get a worker of their own.

## Add settings

A plugin that talks to a device needs to know where the device is. You describe the settings as a
[zod](https://zod.dev) schema, and Nexus turns it into the form. Create
`plugins/smart-plug/src/SmartPlugConfig.ts`:

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugConfig.ts-->

- `z` comes from the SDK (`import { z } from "@lox-nexus/plugin-sdk"`), not from the `zod` package,
  so your schema and Nexus use the same version.
- `title` and `description` are the field's label and help text. Without a title the key is used.
- `.default(5)` fills the field in for the user. `min` and `max` are checked.
- `z.url({ protocol: /^https?$/ })` refuses anything that isn't an http or https address.

For passwords and tokens you would wrap the field in `secret()`, so it never goes back to the
browser. The plug needs none. See [Settings](../guide/settings.md) for that and the other helpers.

### A small client

The plugin needs to talk to the plug. Keep that in its own class, in
`plugins/smart-plug/src/PlugClient.ts`:

<!--@code: ../../../../../examples/smart-plug/src/PlugClient.ts-->

Three things are worth a second look:

- **The answer is checked, not trusted.** `plugStatus` is a zod schema, like the settings, and
  `PlugStatus` is its type (`z.infer`). Whatever comes over the network is untyped, so the client
  parses it with `safeParse`. If another device sits at that address, or a firmware changes its
  answer, the user gets *the plug at … answered something unexpected; is it the right address?*
  instead of `undefined` values further down. Check data at the boundary and use the checked type
  inside.
- **A timeout** (`AbortSignal.timeout`). A plug that doesn't answer must not block your plugin
  forever.
- **Readable errors.** What the client throws is what the user reads: in the connection test and as
  the instance's status. "can't reach the plug at http://…: connection refused" helps; a stack trace
  doesn't.

### Test connection

Now change `SmartPlugPlugin.ts`. The plugin takes the settings as its type parameter, declares the
schema, and gets a static `test`:

```ts
import { Plugin } from "@lox-nexus/plugin-sdk"
import { PlugClient } from "./PlugClient.ts"
import { smartPlugConfig, type SmartPlugConfig } from "./SmartPlugConfig.ts"

export class SmartPlugPlugin extends Plugin<SmartPlugConfig> {
  static readonly config = smartPlugConfig

  // test() goes here

  override start() {
    this.log.info(`the plug is at ${this.config.address}`)
  }
}
```

Write `test()` in place of the comment:

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.ts#test-->

`test` is static because Nexus calls it **before** an instance exists,
with what the user has typed, to check it. It reads from the device, never writes, and either returns
a short message or throws a message the user can act on.

### Try it

Saving the file restarts the instances of your plugin, and the *Desk lamp* instance from before
now fails: it has no address, and the new schema requires one. Open **Plugins** and the instance.
It shows **error**, with the alert **Failed to start** and a message that starts with
`invalid config`. Nexus doesn't restart an instance that failed this way, because it would fail the
same way again.

1. Press **Edit**. The form **Edit Desk lamp** now has the fields **Address** and **Read every
   (seconds)**, and a button **Test connection**.
2. Type `http://127.0.0.1:8090` as the address (the fake plug must be running) and press **Test
   connection**. A green message appears: *Connected to "Desk lamp", which is off*.
3. Change the port to `1`, where nothing listens, and test again. The message is red: *Couldn't connect: can't reach
   the plug at http://127.0.0.1:1: connect ECONNREFUSED 127.0.0.1:1*.
4. Put `8090` back and press **Save**. The instance restarts and shows **running**. The **Log**
   card says *the plug is at http://127.0.0.1:8090*.

**What just happened.** Nexus validated the form against your schema: a field that breaks `min` or
`max` is refused with a message next to it. **Test connection** ran your `static test()` in a
throwaway worker, without starting the instance. Saving started a real worker, validated the
settings again, and gave them to your class as `this.config`, with defaults applied.

Your plugin knows where the plug is. In [step 3](sensors.md) it reads it.
