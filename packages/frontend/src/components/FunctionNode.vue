<script setup lang="ts">
import { Position, Handle } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import type { FunctionNode } from '@/types/FunctionNode';
import { computed } from 'vue';
import { CodeIcon } from '@lucide/vue'

const props = defineProps<NodeProps<FunctionNode>>()

const inputPorts = computed(() => props.data.inputs || [])
const outputPorts = computed(() => props.data.outputs || [])
</script>

<template>
  <div class="vue-flow__node-function">
    <div class="node-function-container">
      <div class="node-function-title">
        {{ data.label }}
      </div>
      <div class="node-function-body">
        <div class="handles-container">
          <Handle v-for="input in inputPorts" :key="input.id" :id="input.id" type="target" :position="Position.Left">
            <span class="input-handle-label">
              {{ input.name }}
            </span>
          </Handle>
        </div>
        <div class="node-function-icon">
          <CodeIcon :size="44" />
        </div>
        <div class="handles-container">
          <Handle v-for="output in outputPorts" :key="output.id" :id="output.id" type="source"
            :position="Position.Right">
            <span class="output-handle-label">
              {{ output.name }}
            </span>
          </Handle>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-function-container {
  background-color: #fff;
  border: 1px solid #222;
  border-radius: 5px;
  width: 100px;
  min-height: 100px;
  text-align: center;
  color: #222;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  display: flex;
  flex-direction: column;
  position: relative;
}

.node-function-title {
  font-size: 14px;
  font-weight: bold;
  position: absolute;
  top: 100%;
  padding: 4px 0;
  color: white
}

.node-function-icon {
  flex: 1;
}

.handles-container {
  position: static;
  display: flex;
  flex-direction: column;
  gap: 25px;
  padding: 15px 0;
  margin-top: 12px;
}

.handles-container .vue-flow__handle {
  position: static;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
}

.input-handle-label {
  position: absolute;
  right: calc(100% + 3px);
  font-size: 10px;
  color: rgb(177, 177, 177)
}

.output-handle-label {
  position: absolute;
  left: calc(100% + 3px);
  font-size: 10px;
  color: rgb(177, 177, 177)
}

.node-function-body {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
}
</style>
