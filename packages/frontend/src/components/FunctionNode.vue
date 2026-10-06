<script setup lang="ts">
import { Position, Handle, useVueFlow } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { checkConnection } from '@/domain/connection'
import { emptyCatalog } from '@/domain/catalog'
import { catalogKey } from '@/domain/injection'
import type { FlowNodeData } from '@/domain/flow'
import type { RootKind } from '@/api/types'
import { computed, inject, ref } from 'vue'
import { CodeIcon, LogInIcon, LogOutIcon, WorkflowIcon } from '@lucide/vue'
import { UiTooltip, UiBadge } from '@low-code-flow/ui'

const props = defineProps<NodeProps<FlowNodeData>>()
const catalog = inject(catalogKey, ref(emptyCatalog()))
const icon = computed(() => ({ code: CodeIcon, function: WorkflowIcon, input: LogInIcon, output: LogOutIcon })[props.data.kind])

const inputPorts = computed(() => props.data.inputs || [])
const outputPorts = computed(() => props.data.outputs || [])

const { connectionStartHandle, connectionClickStartHandle, nodes, edges } = useVueFlow()

// While a connection is being dragged, mark each port on the opposite side as one the drop would accept or reject.
const inputConnectability = computed(() => {
  const start = connectionStartHandle.value ?? connectionClickStartHandle.value
  const result: Record<string, boolean> = {}
  if (!start || start.type !== 'source') return result
  for (const input of inputPorts.value) {
    result[input.id] = checkConnection(
      { source: start.nodeId, sourceHandle: start.id, target: props.id, targetHandle: input.id },
      { nodes: nodes.value, edges: edges.value },
      catalog.value.ancestryOf,
    ).valid
  }
  return result
})

const outputConnectability = computed(() => {
  const start = connectionStartHandle.value ?? connectionClickStartHandle.value
  const result: Record<string, boolean> = {}
  if (!start || start.type !== 'target') return result
  for (const output of outputPorts.value) {
    result[output.id] = checkConnection(
      { source: props.id, sourceHandle: output.id, target: start.nodeId, targetHandle: start.id },
      { nodes: nodes.value, edges: edges.value },
      catalog.value.ancestryOf,
    ).valid
  }
  return result
})

const typeBadgeClasses: Record<RootKind | 'unknown', string> = {
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
const badgeClass = (typeId: string) => typeBadgeClasses[catalog.value.rootKind(typeId) ?? 'unknown']
</script>

<template>
  <div class="node-function-container" :class="{ selected: selected }">
    <div class="node-function-title">
      {{ data.label }}
    </div>
    <div class="node-function-body">
      <div class="handles-container">
        <Handle
          v-for="input in inputPorts"
          :key="input.id"
          :id="input.id"
          type="target"
          :position="Position.Left"
          :class="{
            'is-connectable': inputConnectability[input.id] === true,
            'is-blocked': inputConnectability[input.id] === false,
          }"
        >
          <UiTooltip :side="'left'">
            <span class="input-handle-label">{{ input.name }}</span>
            <template #content>
              <span class="flex items-center gap-1.5">
                {{ input.name }}
                <UiBadge variant="outline" :class="badgeClass(input.typeId)">{{ catalog.name(input.typeId) }}</UiBadge>
              </span>
            </template>
          </UiTooltip>
        </Handle>
      </div>
      <div class="node-function-icon">
        <component :is="icon" :size="44" />
      </div>
      <div class="handles-container">
        <Handle
          v-for="output in outputPorts"
          :key="output.id"
          :id="output.id"
          type="source"
          :position="Position.Right"
          :class="{
            'is-connectable': outputConnectability[output.id] === true,
            'is-blocked': outputConnectability[output.id] === false,
          }"
        >
          <UiTooltip :side="'right'">
            <span class="output-handle-label">{{ output.name }}</span>
            <template #content>
              <span class="flex items-center gap-1.5">
                {{ output.name }}
                <UiBadge variant="outline" :class="badgeClass(output.typeId)">{{ catalog.name(output.typeId) }}</UiBadge>
              </span>
            </template>
          </UiTooltip>
        </Handle>
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-function-container {
  background-color: var(--color-bg);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  width: 100px;
  min-height: 100px;
  text-align: center;
  color: var(--color-fg);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  display: flex;
  flex-direction: column;
  position: relative;
}

.node-function-container.selected {
  outline: 2px solid var(--color-selection);
}

.node-function-title {
  font-size: var(--text-sm);
  font-weight: bold;
  position: absolute;
  top: 100%;
  padding: 4px 0;
  color: var(--color-heading);
}

.node-function-icon {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.handles-container {
  position: static;
  display: flex;
  flex-direction: column;
  gap: 25px;
  padding: 15px 0;
  margin-top: 12px;
  width: 0;
}

.handles-container .vue-flow__handle {
  position: static;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
}

.handles-container .source {
  transform: translate(-50%, -50%);
}

.handles-container .vue-flow__handle.is-connectable {
  background: var(--color-selection);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-selection) 35%, transparent);
}

.handles-container .vue-flow__handle.is-blocked {
  opacity: 0.3;
}

.input-handle-label {
  width: max-content;
  position: absolute;
  right: calc(100% + 3px);
  font-size: var(--text-xs);
  color: var(--color-fg-muted);
  padding-top: 15px;
}

.output-handle-label {
  width: max-content;
  position: absolute;
  left: calc(100% + 3px);
  font-size: var(--text-xs);
  color: var(--color-fg-muted);
  padding-top: 15px;
}

.node-function-body {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
}
</style>
