<script setup lang="ts">
import UiBadge from './UiBadge.vue'

const variants = ['neutral', 'outline', 'info', 'success', 'warning', 'danger'] as const
</script>

<template>
  <Story title="UiBadge">
    <Variant v-for="variant in variants" :key="variant" :title="variant">
      <UiBadge :variant="variant">{{ variant }}</UiBadge>
    </Variant>
  </Story>
</template>
