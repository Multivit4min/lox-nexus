# Plugin guide

This guide explains how the parts of the SDK fit together and when to use each one, one topic per
page. It is for looking things up: read the pages you need, in any order.

New to plugins? Follow the [tutorial](tutorial/index.md) first; it builds a complete plugin step by
step. For a compact list of every signature see [SDK at a glance](sdk-at-a-glance.md), and for
the generated API pages see the [reference](../reference/sdk/index.md).

## Understand the model

| Page | Read it when |
|---|---|
| [How Nexus sees a plugin](guide/structure.md) | You have never seen a Nexus plugin: what runs where, and which files a plugin has. |
| [The lifecycle of a plugin](guide/lifecycle.md) | You wonder where a piece of code belongs, or why something runs again. |
| [The plugin class](guide/plugin-class.md) | Always: what the class declares, what the instance gives you, what you can override. |

## Describe what the user sees

| Page | Read it when |
|---|---|
| [Config: what the user fills in](guide/settings.md) | You add a setting, a Test connection button, a Find button, or change the settings' shape in a later release. |
| [Sensors](guide/sensors.md) | You carry a value from the device to Nexus. |
| [Actuators](guide/actuators.md) | You carry out a command on the device. |
| [Catalog](guide/catalog.md) | The device can list what it has, so users pick signals instead of typing ids. |
| [Panel and actions](guide/panel.md) | The user needs facts about the device on the instance page, or a button there. |

## Run reliably

| Page | Read it when |
|---|---|
| [Starting, failing and degrading](guide/failing.md) | The device can be unreachable or a login can be wrong. |
| [Lifetimes, timers and time zones](guide/lifetimes.md) | You start a timer, listen to an event, or work with the time of day. |
| [Logging, store and status](guide/logging-and-store.md) | You tell the user what happens, or keep a token or cursor across restarts. |
| [Webhooks](guide/webhooks.md) | The other system pushes to you. |
| [Watching signals](guide/watching.md) | Your plugin receives values instead of offering them (an exporter). |
| [Limits and rules](guide/limits.md) | You look for a number (a time, a size), or for the short list of rules. |

Also: [Values](values.md) (the types a signal carries), [Testing](testing.md) and
[Publishing a plugin](publishing.md).
