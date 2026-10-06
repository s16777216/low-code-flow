<script setup lang="ts">
import { computed } from 'vue'
import type { TypeCatalog } from '@/domain/catalog'
import { inputClass } from './formClasses'

const props = defineProps<{
  catalog: TypeCatalog
  /** Types that must not be offered, e.g. descendants of the Type being edited. */
  exclude?: readonly string[]
  disabled?: boolean
  ariaLabel?: string
}>()
const model = defineModel<string>({ required: true })

const visible = (id: string) => !props.exclude?.includes(id)
const system = computed(() => props.catalog.entries.filter((e) => e.system && visible(e.id)))
const project = computed(() => props.catalog.entries.filter((e) => !e.system && visible(e.id)))
</script>

<template>
  <select v-model="model" :class="inputClass" :disabled="disabled" :aria-label="ariaLabel">
    <option v-if="!catalog.get(model)" :value="model" disabled>{{ catalog.name(model) }}</option>
    <optgroup label="System">
      <option v-for="entry in system" :key="entry.id" :value="entry.id">{{ entry.name }}</option>
    </optgroup>
    <optgroup v-if="project.length" label="Project">
      <option v-for="entry in project" :key="entry.id" :value="entry.id">{{ entry.name }}{{ entry.executable ? '' : ' (not executable)' }}</option>
    </optgroup>
  </select>
</template>
