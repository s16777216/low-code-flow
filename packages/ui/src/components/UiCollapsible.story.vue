<script setup lang="ts">
import { ref } from 'vue'
import UiCollapsible from './UiCollapsible.vue'

const open = ref(false)
</script>

<template>
  <Story title="UiCollapsible">
    <Variant title="closed">
      <UiCollapsible>Hidden content.</UiCollapsible>
    </Variant>
    <Variant title="open">
      <UiCollapsible :open="true">Visible content.</UiCollapsible>
    </Variant>
    <Variant title="custom trigger (v-model)">
      <UiCollapsible v-model:open="open">
        <template #trigger>Advanced settings</template>
        Content toggled via v-model.
      </UiCollapsible>
    </Variant>
  </Story>
</template>
