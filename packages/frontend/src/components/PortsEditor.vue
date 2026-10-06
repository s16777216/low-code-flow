<script setup lang="ts">
import { computed } from 'vue'
import { PlusIcon, Trash2Icon } from '@lucide/vue'
import { UiButton } from '@low-code-flow/ui'
import type { PortDefinition } from '@/api/types'
import type { TypeCatalog } from '@/domain/catalog'
import { inputClass } from './formClasses'
import TypeSelect from './TypeSelect.vue'

const props = defineProps<{ title: string; catalog: TypeCatalog; baseName: string }>()
const ports = defineModel<PortDefinition[]>({ required: true })

const duplicates = computed(() => new Set(ports.value.map((p) => p.name).filter((name, i, all) => all.indexOf(name) !== i)))

// Port ids are created once and never change, so renaming or retyping a port keeps its edges.
function add() {
  const taken = new Set(ports.value.map((p) => p.name))
  let n = ports.value.length + 1
  while (taken.has(`${props.baseName}${n}`)) n++
  ports.value = [...ports.value, { id: crypto.randomUUID(), name: `${props.baseName}${n}`, typeId: 'system:string' }]
}
const update = (id: string, patch: Partial<PortDefinition>) => (ports.value = ports.value.map((p) => (p.id === id ? { ...p, ...patch } : p)))
const remove = (id: string) => (ports.value = ports.value.filter((p) => p.id !== id))
</script>

<template>
  <section :aria-label="title">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="text-xs font-semibold tracking-wide text-fg-muted uppercase">{{ title }}</h3>
      <UiButton variant="ghost" type="button" :aria-label="`Add ${title}`" @click="add"><PlusIcon class="size-4" aria-hidden="true" /></UiButton>
    </div>
    <p v-if="!ports.length" class="text-xs text-fg-muted">None</p>
    <ul class="space-y-2">
      <li v-for="port in ports" :key="port.id" class="flex items-start gap-1">
        <div class="min-w-0 flex-1 space-y-1">
          <input :value="port.name" :class="inputClass" :aria-label="`${title} name`" @input="update(port.id, { name: ($event.target as HTMLInputElement).value })" />
          <p v-if="duplicates.has(port.name)" class="text-xs text-danger">Duplicate name</p>
          <TypeSelect :model-value="port.typeId" :catalog="catalog" :aria-label="`${title} type`" @update:model-value="update(port.id, { typeId: $event })" />
        </div>
        <UiButton variant="ghost" type="button" :aria-label="`Remove ${port.name}`" @click="remove(port.id)"><Trash2Icon class="size-4" aria-hidden="true" /></UiButton>
      </li>
    </ul>
  </section>
</template>
