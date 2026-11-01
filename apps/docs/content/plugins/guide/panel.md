# Panel: a status page

Read this when the user needs to see facts about the device on the instance page, or press a button there.

A panel is a view on the instance's page where you show facts that do not belong on the bus: a
firmware version, a table of discovered meters, the last error. Plugins ship no UI code, so a panel
is data:

```ts
override panel(): Panel {
  return {
    type: "sections",
    sections: [
      { title: "Inverter", panel: { type: "keyValue", items: [
        { label: "State", value: { text: "running", tone: "ok" } },
        { label: "Last poll", value: { at: this.lastPoll } }
      ] } },
      { title: "Power", panel: { type: "tiles", tiles: [
        { label: "PV", value: 3200, unit: "W" },
        { label: "Battery", value: 82, unit: "%", min: 0, max: 100 }
      ] } },
      { title: "Meters", panel: { type: "table", columns: ["Meter", "Power"], rows: [["Grid", "412 W"]] } }
    ]
  }
}
```

The parts:

| Part | Shows |
|---|---|
| `keyValue` | label and value pairs; an item may have a `control` (a button or switch, see below) and a `catalog` node id (a "Signals" button) |
| `table` | columns and rows; the page sorts by any column, searches once there are more than 8 rows, and pages by 25. Up to 4 buttons per row (`rowActions`), and per row a catalog node id or `null` (`rowCatalog`, a "Signals" button) |
| `tiles` | headline values as big numbers, at most 12; with `min` and `max` a bar, with `until` a countdown, `hint` under the value. The first tiles go above the Status card |
| `notice` | a box with a message for the user, `tone`, `title`, `text` and an optional `link` (http(s) or a Nexus page `#/…`) |
| `qr` | a QR code of `data`, e.g. a Matter pairing payload |
| `json` | a formatted tree |
| `sections` | titled parts one below the other (at most 20), each with up to 4 buttons in its heading (`actions`) |

**Cells.** Values in key-value lists and tables are *cells*: a string, or `{ text?, tone?, until?, since?, at? }`.
`tone` (`"ok"`, `"warn"`, `"error"`, `"info"`, `"muted"`) shows as a coloured dot with the text in
that colour. `until`, `since` and `at` are epoch milliseconds the page counts down to ("in 12:30"),
up from ("for 3 min", how long a state has lasted) or shows as a moment ("12 s ago", a last poll or
error) while it is open, so a pairing window or "connected since" stays right without a new panel.
Hovering shows the exact time. Format numbers yourself.

**Headline tiles.** The page shows a panel's first `tiles` section above the Status card, on the
page itself, without its title: the values the page is opened for come first. A tiles section with
buttons in its heading stays in the card. Put the tiles that matter most first.

**"Signals" buttons.** A row or item that stands for something in the catalog (a client, a device,
a port) can point at its catalog node: give the node an `id` in `catalog()`, and the row the same id
in the table's `rowCatalog` (one entry per row, `null` for none) or an item's `catalog`. The page
shows a **Signals** button that opens the catalog at that node, so the user adds its signals, or
connects them to a Miniserver, without searching a long catalog. The catalog is read when the
button is pressed; a node that is gone by then says so.

```ts
// catalog(): { label: "iPhone (aa:bb:…)", id: `client:${client.id}`, entries: […] }
{ type: "table", columns: ["Name", "IP"], rows, rowCatalog: clients.map(client => `client:${client.id}`) }
```

**Buttons and switches.** A `RowAction` (`{ action, label?, input? }`) on a row, a key-value item or
a section's heading opens that action's dialog with `input` filled in. Two variants run at once,
without the dialog: `instant: true` (after the action's `confirm`, if it has one), for buttons
whose input is complete, such as "Restart" on a device's row; and `switch: { checked }`, shown as a
switch in that state, which runs the action with `input` when flipped (also after the action's
`confirm`, if it has one), so put the new state there:

```ts
{ label: "Guest Wi-Fi", value: enabled ? "on" : "off", control: { action: "guest-wifi", switch: { checked: enabled }, input: { enabled: !enabled } } }
```

The result of an instant run shows above the panel; then the panel is asked again.

**When it is asked.** `panel()` is asked every 3 seconds while the instance page is open, and only
while the instance runs, so read from memory rather than querying the device. A plugin that knows
when its panel changes declares `static panelUpdates = "push"` and calls `this.panelChanged()`
then (a device paired, a poll finished): open pages ask for it at once, and otherwise only every
30 seconds. `panelChanged()` is cheap; the host hears about it at most once a second. Returning
`undefined` shows nothing. **Never put secrets in a panel.**

**Older Nexus versions.** Tiles, notices, rich cells, item controls and instant or switch buttons
are newer than the panel itself. On a Nexus without them, the runtime turns them into what it
shows: cells into text (a countdown into the time it ends), tiles and notices into key-value
lists, controls left out. You don't check for it.

## Actions: buttons on the instance page

An action is something a user starts from the instance page with a small form: pair a device,
open a pairing window, remove a paired controller. One class per action, declared in the plugin's
`static actions`:

```ts
export class OpenWindowAction extends Action<BridgePlugin> {
  static readonly id = "open-window"
  static readonly label = "Open pairing window"
  static readonly placement = "panel"          // only where the panel puts its button
  async run() {
    this.progress("Opening the window…", 0.5)  // shown in the dialog while it runs
    const code = await this.plugin.bridge.openWindow()
    return { message: "Open for 15 minutes", panel: { type: "qr", data: code } }
  }
}
```

- **Input.** `static input` is a zod schema; the dialog is its form, checked before `run()`. A
  `z.discriminatedUnion` shows as a choice and the chosen branch's fields. Inputs may hold secrets
  (pairing codes): never log them.
- **Answer.** `run()` returns a text (at most 2000 characters), `{ message?, panel? }` with a panel
  part under it (a QR code, tiles, a notice), or nothing ("Done."). Older Nexus versions show the
  message only. A throw is shown as the failure, and the form stays filled in.
- **Progress.** `this.progress(text, fraction?)` tells the user how a long action gets on; the
  dialog shows the text and, with a fraction from 0 to 1, a bar. At most four a second reach the
  host, the latest always.
- **Where its button is.** By default at the top of the page. `static placement = "panel"` puts it
  only where the panel does: on table rows, key-value items and section headings (see [Panel](#panel-a-status-page)).
- **Rules.** One action runs at a time per instance, for at most 2 minutes; it is disposed when it
  settles or the plugin stops. `static confirm` asks before it runs, for actions that undo something.
