<script setup lang="ts">
import { CircleXIcon, TriangleAlertIcon } from '@lucide/vue'
import type { Diagnostic } from '@/api/types'

defineProps<{ diagnostics: Diagnostic[] }>()
</script>

<template>
  <ul v-if="diagnostics.length" class="space-y-1 text-sm" aria-label="Diagnostics">
    <li v-for="(d, i) in diagnostics" :key="i" class="flex items-start gap-2" :class="d.severity === 'error' ? 'text-danger' : 'text-warning'">
      <component :is="d.severity === 'error' ? CircleXIcon : TriangleAlertIcon" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{{ d.message }} <code class="text-xs opacity-70">{{ d.code }}</code></span>
    </li>
  </ul>
</template>
