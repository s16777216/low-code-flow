<template>
  <BezierEdge v-bind="$props" :style="selected ? selectedStyle : defaultStyle" />
</template>
<script lang="ts" setup>
import type { CSSProperties } from 'vue'
import { BezierEdge, type EdgeProps } from '@vue-flow/core'

defineProps<EdgeProps>()

const selectedStyle: CSSProperties = {
  stroke: 'var(--color-selection)',
  strokeWidth: 2,
}

const defaultStyle: CSSProperties = {
  stroke: 'var(--color-border-strong)',
}
</script>
