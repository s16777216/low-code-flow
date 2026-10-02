<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'

export interface UiTooltipProps {
  content?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  delay?: number
}

withDefaults(defineProps<UiTooltipProps>(), { side: 'top' })
</script>

<template>
  <TooltipRoot :delay-duration="delay">
    <TooltipTrigger as-child><slot /></TooltipTrigger>
    <TooltipPortal>
      <TooltipContent
        :side="side"
        :collision-padding="8"
        class="max-w-xs px-3 py-2 shadow-md z-(--z-tooltip) rounded-md border border-border bg-bg-soft text-xs text-fg"
      >
        <slot name="content">{{ content }}</slot>
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
