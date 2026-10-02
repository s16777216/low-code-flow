<script setup lang="ts">
import { RouterView } from 'vue-router'
import { UiTooltipProvider } from '@low-code-flow/ui'
</script>

<template>
  <UiTooltipProvider>
    <RouterView />
  </UiTooltipProvider>
</template>
