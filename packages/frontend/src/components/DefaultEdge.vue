<template>
  <BezierEdge v-bind="$props" :style="selected ? selectedStyle : undefined" />
</template>
<script lang="ts" setup>
import type { CSSProperties } from 'vue'
import { BezierEdge, type EdgeProps } from '@vue-flow/core'

defineProps<EdgeProps>()

const selectedStyle: CSSProperties = {
  stroke: 'rgb(59, 130, 246)',
  strokeWidth: 2,
}
</script>
