# 5. When things go wrong, and nicer to use

This step does three things. The plugin reports an unplugged plug and recovers when it is back.
It offers a **catalog**, so the user picks signals from a list instead of typing. And it shows a
status **panel**. You unplug the fake plug and watch the instance degrade, and you see a catalog
dialog and a **Status** card.

## A plug that goes away

Devices vanish: someone pulls the plug, the router restarts, Wi-Fi drops. Your plugin has to
survive that without anyone restarting it. You already wrote the code in step 3. This is the part
of `poll()` that runs when reading fails:

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.ts#poll-failed-->

Three decisions are in there:

- **Degraded, not failed.** `this.status.set("degraded", message)` says the instance runs but has a
  problem. It keeps its timer and tries again at the next reading. The user sees the message.
- **Back to running.** After a successful reading, `this.status.set("running")` clears it.
- **Log once, not every time.** A plug that stays away for a day would otherwise write 17 000 log
  lines. The code remembers the last problem in `this.problem` and logs only when it changes, and
  once more when the plug is back (`the plug answers again`).

There are three ways to say that something is wrong, and they mean different things:

| Situation | What to do | What Nexus does |
|---|---|---|
| The user must fix something (a wrong password) | Reject `start()` with a readable message | Shows **error**. Doesn't restart it: it would fail the same way. |
| The device is unreachable now but may return | Resolve `start()`, call `status.set("degraded", …)`, keep trying | Shows **degraded** with your message. |
| The device is back | `status.set("running")` | Back to normal. |

Status messages and log lines are also read by AI agents that are connected to Nexus. Never put a
password or token in them. See [Starting, failing and degrading](../guide/failing.md) for the
details.

### Try it

Stop the fake plug with Ctrl+C in its terminal.

- Within five seconds, the instance page shows the badge **degraded** and an alert titled
  **Degraded** with *can't reach the plug at http://127.0.0.1:8090: connect ECONNREFUSED
  127.0.0.1:8090*. On the **Plugins** page the row shows the same in its *Status* and *Message*
  columns.
- The **Log** card has one warning, *can't read the plug*, with the problem as data. Wait a minute:
  it is still only one.
- The sensors keep their last values; nothing new is published.

Start the plug again (`npm run fake-plug -w @lox-nexus/example-smart-plug`). At the next reading the
badge turns back to **running**, the alert disappears and the log gets *the plug answers again*. A
new fake plug starts switched off, so *Switched on* drops to off.

## A catalog

Typing `power` into a form works for a tutorial. A real device may have 50 readings, and users
shouldn't have to know their names. A **catalog** is a tree the plugin builds on request: the user
browses what the device has and adds many signals at once. Add this method to the class. It uses
what the plug reported last, so the user sees current values while browsing:

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.ts#catalog-->

(It needs `import { Plugin, type CatalogNode, type Panel } from "@lox-nexus/plugin-sdk"` and
`import { Value } from "@lox-nexus/plugin-sdk/values"`. The `Panel` type is for the next part.)

- A **node** is a folder with a `label`, and `entries`, `children`, or both. Here there is one node,
  named after the plug.
- An **entry** names one of your sensors or actuators by its static `id` (`capability`) and gives
  the `params` for it. Nexus validates the params against that capability's schema when the user
  adds it.
- **`label`** is the name the new signal gets. **`unit`** and **`value`** are only for show while
  browsing, and the new signal takes the unit. An entry with a bad value is dropped silently, not
  failed.
- The actuator entry has no value: it doesn't read anything.

### Try it

On the instance page, press **Add from catalog**. The dialog **Add from the catalog of Desk lamp**
shows a table with *Where*, *Name*, *Value*, *Kind*. You see the four entries with the plug's
current values, such as `60 W`. The ones you added by hand carry a green check; **Energy** has a
**+** button.

Press **+** at **Energy**. It joins the signal list with the unit `kWh`, which you did not type.
The sliders button beside it lets you change an entry before adding it. If you tick several
entries, **Connect N to a Miniserver…** adds them and connects them in one go.

## A panel

The instance page has room for facts that don't belong on the bus: which plug it is, when it last
answered, what is wrong. Plugins ship no interface code, so a **panel** is plain data that Nexus
renders. Add this method too:

<!--@code: ../../../../../examples/smart-plug/src/SmartPlugPlugin.ts#panel-->

- **`type: "keyValue"`** is a list of label and value pairs. Other types are tiles with big numbers,
  tables, notices, QR codes and a titled group of those: see [Panel and actions](../guide/panel.md).
- A **cell** is a string, or an object with a `tone` (`ok`, `warn`, `error`, `info`, `muted`) that
  shows as a coloured dot, or with `at`, an epoch time that the page shows as *12 s ago* and keeps
  current without a new panel.
- Format numbers yourself (`"60 W"`).
- **`panel()` is called again and again while the page is open** (how often: [Panel](../guide/panel.md#panel-a-status-page)), so it reads from memory (`latest`,
  `problem`), never from the device.
- **Never put secrets in a panel.**

### Try it

The instance page now has a card **Status** with five rows: *Plug*, *State*, *Power*, *Energy* and
*Last reading*. The state is a green *on* or a grey *off*, and *Last reading* counts up
(*3 s ago*). Stop the fake plug again: *State* turns red and shows the error. The refresh button in
the card's header asks for the panel at once.

Your plugin is complete. In [the last step](tests-and-install.md) you test it and install it like
any other.
