<script setup lang="ts">
import type { PortDefinition } from '@/api/types'
import type { TypeCatalog } from '@/domain/catalog'
import { inputClass } from './formClasses'

defineProps<{ inputs: PortDefinition[]; outputs: PortDefinition[]; catalog: TypeCatalog }>()
const code = defineModel<string>({ required: true })
</script>

<template>
  <textarea v-model="code" rows="14" spellcheck="false" aria-label="Code" :class="[inputClass, 'font-mono']" />
</template>
