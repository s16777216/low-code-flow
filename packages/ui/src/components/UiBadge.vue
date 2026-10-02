<script setup lang="ts">
type Variant = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface UiBadgeProps {
  variant?: Variant
}

withDefaults(defineProps<UiBadgeProps>(), { variant: 'neutral' })

const variantClasses: Record<Variant, string> = {
  neutral: 'border-border bg-bg-mute text-fg',
  info: 'border-info text-info',
  success: 'border-success text-success',
  warning: 'border-warning text-warning',
  danger: 'border-danger text-danger',
}
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium',
      variantClasses[variant],
    ]"
  >
    <slot />
  </span>
</template>
