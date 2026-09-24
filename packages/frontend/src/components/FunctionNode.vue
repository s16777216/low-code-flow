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

    <div class="handles-container">
      <Handle v-for="(input, index) in inputPorts" :key="index" :id="input" type="source" :position="Position.Left">
        <span class="source-handle-label">
          {{ input }}
        </span>
      </Handle>
    </div>
    <div class="function-node-container">
      <div>{{ data.label }}</div>
      <div>
        <CodeIcon />
      </div>
    </div>
    <div class="handles-container">
      <Handle v-for="(output, index) in outputPorts" :key="index" :id="output" type="target" :position="Position.Right">
        <span class="target-handle-label">
          {{ output }}
        </span>
      </Handle>
    </div>
  </div>
</template>

<style scoped>
.vue-flow__node-function {
  background-color: #fff;
  border: 1px solid #222;
  border-radius: 5px;
  width: 150px;
  text-align: center;
  color: #222;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}

.function-node-container {
  flex: 1;
}

.handles-container {
  position: static;
  display: flex;
  flex-direction: column;
  gap: 25px;
  padding: 25px 0;
  margin-top: 8px;
}

.handles-container .vue-flow__handle {
  position: static;
  width: 16px;
  height: 16px;
}

.source-handle-label {
  position: relative;
  top: -8px;
  left: 20px;
  font-size: 12px;
}
</style>
