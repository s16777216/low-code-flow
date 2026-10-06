<script setup lang="ts">
import { computed } from 'vue'
import { UiBadge } from '@low-code-flow/ui'
import type { PortRecord, RootKind } from '@/api/types'
import type { TypeCatalog } from '@/domain/catalog'

const props = defineProps<{ record: PortRecord; catalog: TypeCatalog }>()

const typeColor: Record<RootKind | 'unknown', string> = {
  unknown: 'text-fg-muted',
  string: 'text-type-string',
  number: 'text-type-number',
  boolean: 'text-type-boolean',
  object: 'text-type-object',
  array: 'text-type-array',
  date: 'text-type-date',
  function: 'text-type-function',
  any: 'text-type-any',
}

const value = computed(() => props.record.value)
// The Type of the value is its nominal identity, which can be a subtype of what the port declares.
const identityId = computed(() => value.value?.typeId ?? props.record.typeId)
const color = computed(() => typeColor[props.catalog.rootKind(identityId.value) ?? 'unknown'])
const full = computed(() => (value.value ? JSON.stringify(value.value.value, null, 2) : ''))
const short = computed(() => (full.value.length > 80 ? `${full.value.replace(/\s+/g, ' ').slice(0, 80)}...` : full.value.replace(/\s+/g, ' ')))
</script>

<template>
  <li class="rounded-sm border border-border px-2 py-1 text-xs">
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-medium text-fg">{{ record.portName }}</span>
      <UiBadge variant="outline" :class="color">{{ catalog.name(identityId) }}</UiBadge>
      <span v-if="value && value.typeId !== record.typeId" class="text-fg-muted">as {{ catalog.name(record.typeId) }}</span>
      <code v-if="value" class="text-fg-muted" :title="`Type definition hash ${value.typeDefinitionHash}`">#{{ value.typeDefinitionHash.slice(0, 8) }}</code>
    </div>
    <details v-if="value" class="mt-1">
      <summary class="cursor-pointer break-all text-fg">{{ short }}</summary>
      <pre class="mt-1 max-h-48 overflow-auto rounded-sm bg-bg-mute p-2">{{ full }}</pre>
    </details>
    <p v-else-if="record.error" class="mt-1 text-danger">{{ record.error }}</p>
    <p v-else class="mt-1 text-fg-muted">no value</p>
  </li>
</template>
