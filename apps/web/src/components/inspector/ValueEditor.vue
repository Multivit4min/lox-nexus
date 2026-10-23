<script setup lang="ts">
import type { ValueType } from "@lox-nexus/plugin-sdk/values"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ValueDraft } from "../../lib/ValueDraft.ts"

/** Type select plus an input that fits the type. The parent parses with ValueDraft.parse(). */
const type = defineModel<ValueType>("type", { required: true })
const text = defineModel<string>("text", { required: true })
defineProps<{ error?: string }>()
</script>

<template>
  <div class="grid gap-2">
    <Select v-model="type">
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem v-for="option in ValueDraft.TYPES" :key="option" :value="option">{{ option }}</SelectItem>
      </SelectContent>
    </Select>
    <Select v-if="type === 'boolean'" v-model="text">
      <SelectTrigger><SelectValue placeholder="true or false" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="true">true</SelectItem>
        <SelectItem value="false">false</SelectItem>
      </SelectContent>
    </Select>
    <Input v-else-if="type === 'number' || type === 'string'" v-model="text" :type="type === 'number' ? 'number' : 'text'" step="any" />
    <Textarea v-else-if="type !== 'null'" v-model="text" class="font-mono text-xs" rows="3" />
    <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
  </div>
</template>
