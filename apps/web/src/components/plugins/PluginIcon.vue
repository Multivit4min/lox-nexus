<script setup lang="ts">
import { computed, type Component } from "vue"
import { Bell, Calendar, Camera, Cloud, Code, Database, Gauge, House, Lightbulb, Music, Plug, Sun, Thermometer, Webhook, Wifi, Zap } from "@lucide/vue"

/**
 * A plugin's icon from the name in its manifest (`loxNexus.icon`). Only these names have an icon;
 * any other name, or none, shows a plug. The list is in the publishing guide.
 */
const props = defineProps<{ name?: string }>()

const ICONS: Record<string, Component> = {
  bell: Bell, calendar: Calendar, camera: Camera, cloud: Cloud, code: Code, database: Database, gauge: Gauge, home: House,
  lightbulb: Lightbulb, music: Music, plug: Plug, solar: Sun, sun: Sun, thermometer: Thermometer, webhook: Webhook, wifi: Wifi, zap: Zap
}
const icon = computed(() => (props.name ? ICONS[props.name] : undefined) ?? Plug)
</script>

<template>
  <component :is="icon" aria-hidden="true" />
</template>
