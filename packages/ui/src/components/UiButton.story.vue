<script setup lang="ts">
import UiButton from './UiButton.vue'
</script>

<template>
  <Story title="UiButton">
    <Variant title="Playground">
      <UiButton>Button</UiButton>
    </Variant>
    <Variant v-for="variant in ['primary', 'secondary', 'ghost', 'danger']" :key="variant" :title="variant">
      <UiButton :variant="variant as 'primary'">{{ variant }}</UiButton>
    </Variant>
    <Variant title="disabled">
      <UiButton disabled>Disabled</UiButton>
    </Variant>
  </Story>
</template>
