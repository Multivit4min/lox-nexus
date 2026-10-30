# Changelog

## 0.8.0 (2026-10-30)

Lox Nexus 0.8.0 is a complete rewrite of Nexus. It connects Home Assistant, Fronius inverters,
calendars, MQTT and more to Loxone Miniservers over Network Intercommunication, with a new web UI,
plugins that are installed and updated in the UI, and a published Docker image.

### Install

```sh
mkdir lox-nexus && cd lox-nexus
curl -fsSLO https://raw.githubusercontent.com/Multivit4min/lox-nexus/main/compose.yaml
docker compose up -d
```

Then open `http://<host>:8080/`. The image `ghcr.io/multivit4min/lox-nexus` runs on amd64 and
arm64 (e.g. a Raspberry Pi 4 or 5). Documentation: https://multivit4min.github.io/lox-nexus/

### Highlights

- **Signals and wires:** every Miniserver input and output and every plugin value is a signal. A
  wire connects a source to a target and can invert, scale, map, debounce, throttle or convert on
  the way. Signals carry a unit and a precision, and can warn when a value stops arriving.
- **Plugins:** Home Assistant, Fronius, Calendar (iCal), MQTT, Webhook, Script, InfluxDB and a
  Matter bridge for Apple Home, Google Home and Alexa. Each instance runs in its own worker
  thread and restarts by itself after a crash. Plugins are installed, updated and rolled back in
  the UI, from the built-in repository, a ZIP file or a git repository.
- **Bus Inspector:** every message live with its cause chain, and forces to pin any signal to a
  value for testing or maintenance.
- **History** charts, **backups** of the whole installation (encrypted with a passphrase), and a
  **config export** that carries plugin instances with their secrets sealed.
- **Import from Loxone Config:** signals can be read from the project on the Miniserver.
- **Plugin SDK** for your own plugins, with compatibility rules for future versions
  ([ADR 0019](docs/adr/0019-sdk-and-wire-evolution.md)). It isn't on npm yet.

### Coming from the previous Nexus (0.7.x)

- **It is a new installation.** 0.8.0 doesn't read the previous Nexus's database or export, so
  Miniservers, signals and integrations are set up again. Run both side by side while you move
  over, on different ports.
- **Docker instead of the tarball with pm2.** The previous update command
  (`…/releases/latest/download/loxone-nexus.tar.gz`) no longer finds a download, so it can't
  replace an old installation by accident.
- **The previous version stays available:** its code is on the
  [`legacy` branch](https://github.com/Multivit4min/lox-nexus/tree/legacy), and its releases
  (up to 0.7.2) remain downloadable by version.
- **Not ported yet:** the Sonos and Hue integrations.
