<script setup lang="ts">
import { computed } from 'vue'
import { ExternalLinkIcon } from '@lucide/vue'
import { UiBadge, UiBanner } from '@low-code-flow/ui'
import type { PortDefinition } from '@/api/types'
import type { TypeCatalog } from '@/domain/catalog'
import type { FlowNode, FlowNodeData, Signature } from '@/domain/flow'
import CodeEditor from './CodeEditor.vue'
import PortsEditor from './PortsEditor.vue'
import { inputClass, labelClass } from './formClasses'

const props = defineProps<{ projectId: string; node: FlowNode | null; catalog: TypeCatalog }>()
const emit = defineEmits<{ 'update-node': [id: string, patch: Partial<FlowNodeData>] }>()
const name = defineModel<string>('name', { required: true })
const signature = defineModel<Signature>('signature', { required: true })

const data = computed(() => props.node?.data)
const patch = (value: Partial<FlowNodeData>) => props.node && emit('update-node', props.node.id, value)
const ports = (list: PortDefinition[]) => list
</script>

<template>
  <aside class="w-80 shrink-0 space-y-4 overflow-y-auto border-l border-border bg-bg-soft p-3 text-sm" aria-label="Inspector">
    <template v-if="!node">
      <h2 class="text-xs font-semibold tracking-wide text-fg-muted uppercase">Function</h2>
      <div>
        <label for="function-name" :class="labelClass">Name</label>
        <input id="function-name" v-model="name" :class="inputClass" />
      </div>
      <PortsEditor v-model="signature.inputs" title="Inputs" :catalog="catalog" base-name="input" />
      <PortsEditor v-model="signature.outputs" title="Outputs" :catalog="catalog" base-name="output" />
      <p class="text-xs text-fg-muted">Select a node on the canvas to edit it. Ports keep their identity when renamed, so connections stay.</p>
    </template>

    <template v-else-if="data && data.kind === 'code'">
      <h2 class="text-xs font-semibold tracking-wide text-fg-muted uppercase">Code node</h2>
      <div>
        <label for="node-name" :class="labelClass">Name</label>
        <input id="node-name" :value="data.label" :class="inputClass" @input="patch({ label: ($event.target as HTMLInputElement).value })" />
      </div>
      <PortsEditor :model-value="ports(data.inputs)" title="Inputs" :catalog="catalog" base-name="input" @update:model-value="patch({ inputs: $event })" />
      <PortsEditor :model-value="ports(data.outputs)" title="Outputs" :catalog="catalog" base-name="output" @update:model-value="patch({ outputs: $event })" />
      <div>
        <span :class="labelClass">Code</span>
        <CodeEditor :model-value="data.code ?? ''" :inputs="data.inputs" :outputs="data.outputs" :catalog="catalog" @update:model-value="patch({ code: $event })" />
        <p class="mt-1 text-xs text-fg-muted">Read <code>ctx.inputs.&lt;name&gt;</code> and return an object with one key per output. The server checks every output against its Type.</p>
      </div>
    </template>

    <template v-else-if="data && data.kind === 'function'">
      <h2 class="text-xs font-semibold tracking-wide text-fg-muted uppercase">Function node</h2>
      <div>
        <label for="node-label" :class="labelClass">Label</label>
        <input id="node-label" :value="data.label" :class="inputClass" @input="patch({ label: ($event.target as HTMLInputElement).value })" />
      </div>
      <UiBanner variant="info">Ports always follow the called function's current signature. Edit the signature there.</UiBanner>
      <RouterLink v-if="data.functionId" :to="{ name: 'function', params: { projectId, assetId: data.functionId } }" class="flex items-center gap-1 text-accent hover:underline">
        Open function <ExternalLinkIcon class="size-3" aria-hidden="true" />
      </RouterLink>
      <section v-for="[title, list] in [['Inputs', data.inputs], ['Outputs', data.outputs]] as const" :key="title" :aria-label="title">
        <h3 class="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">{{ title }}</h3>
        <p v-if="!list.length" class="text-xs text-fg-muted">None</p>
        <ul class="space-y-1">
          <li v-for="port in list" :key="port.id" class="flex items-center justify-between gap-2">
            <span>{{ port.name }}</span><UiBadge variant="neutral">{{ catalog.name(port.typeId) }}</UiBadge>
          </li>
        </ul>
      </section>
    </template>

    <template v-else>
      <h2 class="text-xs font-semibold tracking-wide text-fg-muted uppercase">{{ data?.kind === 'input' ? 'Function inputs' : 'Function outputs' }}</h2>
      <p class="text-xs text-fg-muted">These ports come from the function signature. Click an empty spot on the canvas to edit the signature.</p>
    </template>
  </aside>
</template>
