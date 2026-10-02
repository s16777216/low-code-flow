<script setup lang="ts">
import { useId } from 'vue'
import { ChevronDown } from '@lucide/vue'

const open = defineModel<boolean>('open', { default: false })
const contentId = useId()
</script>

<template>
  <div>
    <button
      type="button"
      :aria-expanded="open"
      :aria-controls="contentId"
      class="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-fg hover:bg-bg-mute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      @click="open = !open"
    >
      <slot name="trigger">Details</slot>
      <ChevronDown aria-hidden="true" class="size-4 transition-transform" :class="{ 'rotate-180': open }" />
    </button>
    <div :id="contentId" :hidden="!open" class="text-sm text-fg"><slot /></div>
  </div>
</template>
