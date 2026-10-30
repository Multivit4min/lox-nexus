# Plugin README format

Every first-party plugin has two documentation files:

- **`README.md`**: short (aim for 60 to 90 lines), in exactly the structure below. Nexus shows it
  under **Read me** on the Installed page, and it starts the plugin's page on the documentation
  site. Write it for the person setting the plugin up, not for its developer.
- **`REFERENCE.md`**: everything else a user may need later (params of every sensor and actuator,
  payload formats, catalog details, panel fields, limits, security notes, development notes,
  "fixed compared to the old integration"). It starts with a level-2 heading, has no level-1
  heading, and doesn't repeat the README's summary or configuration table. The documentation
  site shows it below the README; the installer doesn't install it.

Neither file links to the other (the site includes both on one page, where such a link would
break); the README's last section names the reference in plain text.

## README.md, section by section

Use these headings, in this order, with this wording. Leave out a section only where the note
says so.

```markdown
# <Plugin name> plugin

<One to three sentences: what the plugin connects Nexus to, and in which direction values flow.>

## What it does

- **Sensors:** <what comes into Nexus, in one line each kind>
- **Actuators:** <what Nexus can control>
- **Catalog:** <what can be browsed to add signals>
- **Panel:** <what the status panel shows>
- **Actions:** <the buttons on the instance page and what they do>   (only for plugins with actions)
- **Export:** <what it publishes of other signals>   (only for plugins that watch signals)

(Leave out a bullet the plugin doesn't have. Plain sentences, no params here.)

## Before you start

- <what the user needs: the device or service, its version, network access, an account or token,
  a setting to switch on there>

## Configuration

| Field | | Description |
|---|---|---|
| **<Form title>** (`<key>`) | <required / optional; default `<value>`; secret> | <what it is, when to change it, an example value> |

(One row per field of the plugin's config schema, in schema order; the form title exactly as
the form shows it. Nested objects get one row per field, as `parent.child`; fields of the items of
a list as `parent[].child`.)

## Sensors and actuators

| Kind | Name (id) | Value | What it is |
|---|---|---|---|
| sensor | <label> (`<id>`) | <value type> | <one line> |
| actuator | <label> (`<id>`) | <accepted type> | <one line> |

(Every sensor and actuator the plugin declares, sensors first. Their params are in the
reference. A plugin without any says so in one sentence instead of the table.)

## Good to know

- <two to five points a user trips over: limits, security, a common mistake, how it behaves
  when the device is offline>

## More

The full reference (<the main topics it covers>) is in `REFERENCE.md` next to this file, and on
the plugin's page in the Nexus documentation.
```

## Style

Short, plain sentences. Values, keys and ids in backticks. No marketing, no history. Every fact
checked against the plugin's source (config schema, the sensor and actuator classes).
