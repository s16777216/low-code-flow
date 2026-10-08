<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { UiButton, UiDialog } from '@low-code-flow/ui'
import type { PortDefinition } from '@/api/types'
import type { TypeCatalog } from '@/domain/catalog'
import { fieldKindFor, initialFieldText, parseField } from '@/domain/rawInput'
import { inputClass, labelClass } from './formClasses'

const props = defineProps<{ inputs: PortDefinition[]; catalog: TypeCatalog }>()
const emit = defineEmits<{ run: [values: Record<string, unknown>] }>()
const open = defineModel<boolean>('open', { default: false })

const texts = ref<Record<string, string>>({})
const errors = ref<Record<string, string>>({})
const kinds = computed(() => Object.fromEntries(props.inputs.map((p) => [p.id, fieldKindFor(props.catalog.rootKind(p.typeId))])))

watch(open, (isOpen) => {
  if (!isOpen) return
  errors.value = {}
  texts.value = Object.fromEntries(props.inputs.map((p) => [p.id, texts.value[p.id] ?? initialFieldText(kinds.value[p.id]!)]))
})

function submit() {
  const values: Record<string, unknown> = {}
  errors.value = {}
  for (const port of props.inputs) {
    const result = parseField(kinds.value[port.id]!, String(texts.value[port.id] ?? ''))
    if (result.ok) values[port.name] = result.value
    else errors.value[port.id] = result.error
  }
  if (Object.keys(errors.value).length) return
  open.value = false
  emit('run', values)
}
</script>

<template>
  <UiDialog v-model:open="open" title="Run function"
    description="Values are checked against each input's Type before anything runs.">
    <form id="run-form" class="space-y-3" @submit.prevent="submit">
      <p v-if="!inputs.length" class="text-sm text-fg-muted">This function takes no inputs.</p>
      <div v-for="port in inputs" :key="port.id">
        <label :for="`run-${port.id}`" :class="labelClass">{{ port.name }} <span class="text-fg-muted">({{
          catalog.name(port.typeId) }})</span></label>
        <label v-if="kinds[port.id] === 'boolean'" class="flex items-center gap-2 text-sm">
          <input :id="`run-${port.id}`" type="checkbox" :checked="texts[port.id] === 'true'"
            @change="texts[port.id] = ($event.target as HTMLInputElement).checked ? 'true' : 'false'" /> true
        </label>
        <textarea v-else-if="kinds[port.id] === 'json'" :id="`run-${port.id}`" v-model="texts[port.id]" rows="3"
          :class="[inputClass, 'font-mono']" />
        <input v-else :id="`run-${port.id}`" v-model="texts[port.id]"
          :type="kinds[port.id] === 'number' ? 'number' : 'text'" step="any"
          :placeholder="kinds[port.id] === 'date' ? '2026-10-02T08:00:00Z' : ''" :class="inputClass" />
        <p v-if="errors[port.id]" class="mt-1 text-xs text-danger">{{ errors[port.id] }}</p>
      </div>
    </form>
    <template #footer>
      <UiButton variant="ghost" @click="open = false">Cancel</UiButton>
      <UiButton type="submit" form="run-form">Run</UiButton>
    </template>
  </UiDialog>
</template>
