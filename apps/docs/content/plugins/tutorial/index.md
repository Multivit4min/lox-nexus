# Tutorial: your first plugin

In this tutorial you build a plugin for a **smart plug**: a socket with an HTTP API that you can
switch on and off and that reports how much power it draws. Real plugs (Shelly, Tasmota, myStrom)
work much like this. You don't need one: the repository has a **fake plug** that behaves the same
way, so everything runs on your computer.

When you are done, your plugin:

- has a settings form with a **Test connection** button,
- reads the plug every few seconds and offers its power, energy and on/off state as **sensors**,
- switches the plug through an **actuator**, so a button in Loxone can turn a lamp on,
- shows as **degraded** when the plug is unplugged, and recovers on its own,
- offers a **catalog** and a status **panel**,
- has tests, and installs from a ZIP file.

Each step ends with something you can see in the Nexus web interface. You don't need to know
Loxone to follow along, but two steps connect the plug to a Miniserver, and for those you do need
one.

## The steps

| Step | You build | You see |
|---|---|---|
| [1. Set up](set-up.md) | Nexus from source, and the fake plug | The web interface, and the plug answering in a terminal |
| [2. A first plugin](first-plugin.md) | The package, the plugin class, the settings and Test connection | Your plugin in **Add instance**, a green *Connected to "Desk lamp"* |
| [3. Sensors](sensors.md) | A shared poll and two sensors | Live values in the signal list and the Bus Inspector |
| [4. An actuator](actuator.md) | A switch | The fake plug turning on when you press a button |
| [5. When things go wrong, and nicer to use](finishing.md) | Degraded status, a catalog, a panel | A *degraded* instance that recovers, a **Status** card |
| [6. Tests, build and install](tests-and-install.md) | Tests against the fake plug, a bundle, a ZIP | Green tests, and your plugin installed like any other |

The finished plugin is in the repository as
[`examples/smart-plug/`](https://github.com/Multivit4min/lox-nexus/tree/main/examples/smart-plug).
It is tested, and every code block in this tutorial is taken from it, so what you read is what
runs. When something doesn't work, compare your file with the one there. If you would rather read than
type, [the whole plugin on one page](whole-plugin.md) shows the main class in one piece.

## What you need

- A computer with **Node.js 24 or newer**, `git` and `npm`, and a POSIX shell: macOS, Linux, or WSL
  on Windows. The commands that set an environment variable in front of `npm run dev` need one.
- A text editor, and some TypeScript. You don't need to know zod or the SDK.
- Optional: a Loxone Miniserver on your network, for the two steps that connect to it.

Start with [step 1](set-up.md).
