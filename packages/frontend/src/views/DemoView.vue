<template>
  <VueFlow :nodes="nodes" :edges="edges" :is-valid-connection="isValidConnection" fit-view-on-init>
    <template #node-function="functionNodeProps">
      <FunctionNode v-bind="functionNodeProps" />
    </template>
    <template #edge-default="defaultEdgeProps">
      <DefaultEdge v-bind="defaultEdgeProps" />
    </template>

    <MiniMap pannable zoomable />
    <Controls />
  </VueFlow>
</template>
<script lang="ts" setup>
import { ref } from 'vue'
import type { Node, Edge, ValidConnectionFunc } from '@vue-flow/core'
import { useVueFlow, VueFlow } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import { Controls } from '@vue-flow/controls'

import DefaultEdge from '@/components/DefaultEdge.vue'
import FunctionNode from '@/components/FunctionNode.vue'
import type { FunctionNode as FunctionNodeType } from '@/types/FunctionNode'
import { checkConnection } from '@/domain/connection'

const { onConnect, addEdges } = useVueFlow()

const isValidConnection: ValidConnectionFunc = (connection, { nodes, edges }) =>
  checkConnection(connection, { nodes, edges }).valid

onConnect((connection) => {
  addEdges({
    ...connection,
    id: `${connection.source}.${connection.sourceHandle}->${connection.target}.${connection.targetHandle}`,
  })
})

// Sample order-checkout flow: fan-out from fetch-order, join at apply-discount,
// and an `any` input on log-result.
const nodes = ref<Node<FunctionNodeType>[]>([
  {
    id: 'fetch-order',
    type: 'function',
    position: { x: 0, y: 150 },
    data: {
      label: 'Fetch Order',
      inputs: [{ id: 'order-id', name: 'orderId', type: 'string' }],
      outputs: [
        { id: 'order', name: 'order', type: 'object' },
        { id: 'customer-id', name: 'customerId', type: 'string' },
      ],
    },
  },
  {
    id: 'calc-total',
    type: 'function',
    position: { x: 300, y: 0 },
    data: {
      label: 'Calc Total',
      inputs: [{ id: 'order', name: 'order', type: 'object' }],
      outputs: [{ id: 'total', name: 'total', type: 'number' }],
    },
  },
  {
    id: 'fetch-customer',
    type: 'function',
    position: { x: 300, y: 300 },
    data: {
      label: 'Fetch Customer',
      inputs: [{ id: 'customer-id', name: 'customerId', type: 'string' }],
      outputs: [{ id: 'customer', name: 'customer', type: 'object' }],
    },
  },
  {
    id: 'apply-discount',
    type: 'function',
    position: { x: 600, y: 150 },
    data: {
      label: 'Apply Discount',
      inputs: [
        { id: 'total', name: 'total', type: 'number' },
        { id: 'customer', name: 'customer', type: 'object' },
      ],
      outputs: [{ id: 'final-total', name: 'finalTotal', type: 'number' }],
    },
  },
  {
    id: 'log-result',
    type: 'function',
    position: { x: 900, y: 150 },
    data: {
      label: 'Log Result',
      inputs: [{ id: 'value', name: 'value', type: 'any' }],
      outputs: [],
    },
  },
  // Unconnected nodes left free for trying out connections in the editor.
  {
    id: 'format-receipt',
    type: 'function',
    position: { x: 600, y: 450 },
    data: {
      label: 'Format Receipt',
      inputs: [
        { id: 'order', name: 'order', type: 'object' },
        { id: 'final-total', name: 'finalTotal', type: 'number' },
      ],
      outputs: [{ id: 'receipt', name: 'receipt', type: 'string' }],
    },
  },
  {
    id: 'send-email',
    type: 'function',
    position: { x: 900, y: 450 },
    data: {
      label: 'Send Email',
      inputs: [
        { id: 'to', name: 'to', type: 'string' },
        { id: 'body', name: 'body', type: 'string' },
      ],
      outputs: [],
    },
  },
])

// Edges connect specific ports: sourceHandle / targetHandle are port IDs.
const edges = ref<Edge[]>([
  {
    id: 'fetch-order.order->calc-total.order',
    source: 'fetch-order',
    sourceHandle: 'order',
    target: 'calc-total',
    targetHandle: 'order',
  },
  {
    id: 'fetch-order.customer-id->fetch-customer.customer-id',
    source: 'fetch-order',
    sourceHandle: 'customer-id',
    target: 'fetch-customer',
    targetHandle: 'customer-id',
  },
  {
    id: 'calc-total.total->apply-discount.total',
    source: 'calc-total',
    sourceHandle: 'total',
    target: 'apply-discount',
    targetHandle: 'total',
  },
  {
    id: 'fetch-customer.customer->apply-discount.customer',
    source: 'fetch-customer',
    sourceHandle: 'customer',
    target: 'apply-discount',
    targetHandle: 'customer',
  },
  {
    id: 'apply-discount.final-total->log-result.value',
    source: 'apply-discount',
    sourceHandle: 'final-total',
    target: 'log-result',
    targetHandle: 'value',
  },
])
</script>
