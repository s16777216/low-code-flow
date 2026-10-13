<script setup lang="ts">
import UiButton from './UiButton.vue'
import UiTooltip from './UiTooltip.vue'
import UiTooltipProvider from './UiTooltipProvider.vue'

const sides = ['top', 'right', 'bottom', 'left'] as const
</script>

<template>
  <Story title="UiTooltip">
    <Variant v-for="side in sides" :key="side" :title="side">
      <UiTooltipProvider>
        <div class="p-16 flex justify-center">
          <UiTooltip :content="`Tooltip on the ${side}`" :side="side">
            <UiButton variant="secondary">Hover me</UiButton>
          </UiTooltip>
        </div>
      </UiTooltipProvider>
    </Variant>
  </Story>
</template>
