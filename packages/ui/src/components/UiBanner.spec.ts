import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiBanner from './UiBanner.vue'

describe('UiBanner', () => {
  it.each([
    ['neutral', 'bg-bg-soft', 'status'],
    ['info', 'text-info', 'status'],
    ['success', 'text-success', 'status'],
    ['warning', 'text-warning', 'alert'],
    ['danger', 'text-danger', 'alert'],
  ] as const)('maps %s to %s with role %s', (variant, className, role) => {
    const wrapper = mount(UiBanner, { props: { variant }, slots: { default: 'Message' } })
    expect(wrapper.classes()).toContain(className)
    expect(wrapper.attributes('role')).toBe(role)
    expect(wrapper.text()).toBe('Message')
  })
})
