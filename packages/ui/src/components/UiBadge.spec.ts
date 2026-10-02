import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiBadge from './UiBadge.vue'

describe('UiBadge', () => {
  it.each([
    ['neutral', 'bg-bg-mute'],
    ['info', 'text-info'],
    ['success', 'text-success'],
    ['warning', 'text-warning'],
    ['danger', 'text-danger'],
  ] as const)('maps %s to %s', (variant, className) => {
    const wrapper = mount(UiBadge, { props: { variant }, slots: { default: 'Label' } })
    expect(wrapper.classes()).toContain(className)
    expect(wrapper.text()).toBe('Label')
  })
})
