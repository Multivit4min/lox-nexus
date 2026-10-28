/**
 * The code a new instance starts with. It must run without errors on a fresh instance with no
 * signals, so it only uses names nobody has to configure first.
 */
export const TEMPLATE = `// Runs once when the instance starts, and again after every save.
//
// nexus.set(name, value)    sends a value to the sensors of this instance named \`name\`
// nexus.on(name, handler)   runs \`handler\` with each value an actuator named \`name\` receives
// nexus.get(name)           the latest value such an actuator received (undefined until then)
//
// Add sensors and actuators with these names on the instance page (the catalog lists the names
// this script used) and wire them to Loxone or other plugins.

// Publish the time as "HH:MM" at every full minute (sensor "time", type text)
function publishTime() {
  const now = new Date()
  nexus.set("time", now.toTimeString().slice(0, 5))
  setTimeout(publishTime, 60_000 - (now.getTime() % 60_000))
}
publishTime()

// React to a value from Loxone (actuator "light", type switch)
nexus.on("light", on => {
  console.info("light switched", on ? "on" : "off")
  nexus.set("light-status", on ? "on" : "off")
})
`
