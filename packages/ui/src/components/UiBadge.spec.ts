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

  it('leaves color to the caller for the outline variant', () => {
    const wrapper = mount(UiBadge, {
      props: { variant: 'outline' },
      attrs: { class: 'text-danger' },
      slots: { default: 'Label' },
    })
    expect(wrapper.classes()).toContain('border')
    expect(wrapper.classes()).toContain('text-danger')
    expect(wrapper.classes()).not.toContain('text-fg')
    expect(wrapper.classes().some((name) => name.startsWith('border-'))).toBe(false)
  })
})
