<script setup lang="ts">
import { X } from '@lucide/vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from 'reka-ui'

export interface UiDialogProps {
  title: string
  description?: string
  dismissible?: boolean
}

const props = withDefaults(defineProps<UiDialogProps>(), { dismissible: true })
const open = defineModel<boolean>('open', { default: false })

function onPointerDownOutside(event: Event) {
  if (!props.dismissible) event.preventDefault()
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger v-if="$slots.trigger" as-child><slot name="trigger" /></DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="inset-0 fixed z-(--z-overlay) bg-fg/50" />
      <DialogContent
        class="p-6 shadow-lg fixed top-1/2 left-1/2 z-(--z-overlay) max-h-[calc(100vh-2rem)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-bg text-fg focus:outline-none"
        @pointer-down-outside="onPointerDownOutside"
      >
        <div class="gap-4 flex items-start justify-between">
          <div class="min-w-0">
            <DialogTitle class="font-semibold text-base text-heading">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="mt-1 text-sm text-fg-muted">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose
            type="button"
            aria-label="Close dialog"
            class="p-1 rounded-sm text-fg-muted hover:bg-bg-mute hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X aria-hidden="true" class="size-4" />
          </DialogClose>
        </div>
        <div class="mt-4 text-sm"><slot /></div>
        <div v-if="$slots.footer" class="mt-6 gap-2 flex justify-end"><slot name="footer" /></div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
