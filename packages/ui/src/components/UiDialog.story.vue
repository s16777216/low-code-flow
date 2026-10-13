<script setup lang="ts">
import { ref } from 'vue'
import UiButton from './UiButton.vue'
import UiDialog from './UiDialog.vue'

const open = ref(false)
</script>

<template>
  <Story title="UiDialog">
    <Variant title="with trigger">
      <UiDialog title="Delete function" description="This action cannot be undone.">
        <template #trigger><UiButton variant="secondary">Open dialog</UiButton></template>
        Dialog body.
        <template #footer><UiButton variant="danger">Delete</UiButton></template>
      </UiDialog>
    </Variant>
    <Variant title="non-dismissible">
      <UiButton @click="open = true">Open (outside click ignored)</UiButton>
      <UiDialog v-model:open="open" title="Confirm" :dismissible="false">
        Click the close button to dismiss.
      </UiDialog>
    </Variant>
  </Story>
</template>
