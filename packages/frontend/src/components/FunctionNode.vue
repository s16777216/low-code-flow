<script setup lang="ts">
import { Position, Handle } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import type { FunctionNode } from '@/types/FunctionNode'
import { computed } from 'vue'
import { CodeIcon } from '@lucide/vue'
import { UiTooltip, UiBadge } from '@low-code-flow/ui'
import type { PrimitiveType } from '@/types/FunctionNode'

const props = defineProps<NodeProps<FunctionNode>>()

const inputPorts = computed(() => props.data.inputs || [])
const outputPorts = computed(() => props.data.outputs || [])

const typeBadgeClasses: Record<PrimitiveType, string> = {
  string: 'text-type-string border-type-string',
  number: 'text-type-number border-type-number',
  boolean: 'text-type-boolean border-type-boolean',
  object: 'text-type-object border-type-object',
  array: 'text-type-array border-type-array',
  date: 'text-type-date border-type-date',
  function: 'text-type-function border-type-function',
  any: 'text-type-any border-type-any',
}
</script>

<template>
  <div class="node-function-container" :class="{ selected: selected }">
    <div class="node-function-title">
      {{ data.label }}
    </div>
    <div class="node-function-body">
      <div class="handles-container">
        <Handle v-for="input in inputPorts" :key="input.id" :id="input.id" type="target" :position="Position.Left">
          <UiTooltip :side="'left'">
            <span class="input-handle-label">{{ input.name }}</span>
            <template #content>
              <span class="flex items-center gap-1.5">
                {{ input.name }}
                <UiBadge :class="typeBadgeClasses[input.type]">{{ input.type }}</UiBadge>
              </span>
            </template>
          </UiTooltip>
        </Handle>
      </div>
      <div class="node-function-icon">
        <CodeIcon :size="44" />
      </div>
      <div class="handles-container">
        <Handle v-for="output in outputPorts" :key="output.id" :id="output.id" type="source" :position="Position.Right">
          <UiTooltip :side="'right'">
            <span class="output-handle-label">{{ output.name }}</span>
            <template #content>
              <span class="flex items-center gap-1.5">
                {{ output.name }}
                <UiBadge :class="typeBadgeClasses[output.type]">{{ output.type }}</UiBadge>
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
