<script setup lang="ts">
import UiBanner from './UiBanner.vue'

const variants = ['neutral', 'info', 'success', 'warning', 'danger'] as const
</script>

<template>
  <Story title="UiBanner">
    <Variant v-for="variant in variants" :key="variant" :title="variant">
      <UiBanner :variant="variant">This is a {{ variant }} banner.</UiBanner>
    </Variant>
  </Story>
</template>
