<script setup lang="ts">
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export interface UiButtonProps {
  variant?: Variant
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

withDefaults(defineProps<UiButtonProps>(), {
  variant: 'primary',
  disabled: false,
  type: 'button',
})

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'border border-border bg-bg-soft text-fg hover:bg-bg-mute',
  ghost: 'text-fg hover:bg-bg-mute',
  danger: 'bg-danger text-accent-fg hover:opacity-90',
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="[
      'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
      variantClasses[variant],
    ]"
  >
    <slot />
  </button>
</template>
