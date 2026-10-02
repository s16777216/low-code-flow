<script setup lang="ts">
type Variant = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface UiBannerProps {
  variant?: Variant
}

withDefaults(defineProps<UiBannerProps>(), { variant: 'neutral' })

const variantClasses: Record<Variant, string> = {
  neutral: 'border-border bg-bg-soft text-fg',
  info: 'border-info text-info',
  success: 'border-success text-success',
  warning: 'border-warning text-warning',
  danger: 'border-danger text-danger',
}
</script>

<template>
  <div
    :role="variant === 'warning' || variant === 'danger' ? 'alert' : 'status'"
    :class="['rounded-md border p-3 text-sm', variantClasses[variant]]"
  >
    <slot />
  </div>
</template>
