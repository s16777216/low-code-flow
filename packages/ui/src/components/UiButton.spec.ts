import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import UiButton from './UiButton.vue'

function activate(button: HTMLButtonElement, key: 'Enter' | ' ') {
  button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }))
  if (key === ' ') button.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key }))
  // jsdom does not perform the browser's default keyboard activation.
  button.click()
}

describe('UiButton', () => {
  it.each(['Enter', ' '] as const)('activates with %s on a native button', (key) => {
    const onClick = vi.fn<(event: MouseEvent) => void>()
    const wrapper = mount(UiButton, { attrs: { onClick }, slots: { default: 'Save' } })
    const button = wrapper.get('button').element
    expect(button).toBeInstanceOf(HTMLButtonElement)
    activate(button, key)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not click when disabled', () => {
    const onClick = vi.fn<(event: MouseEvent) => void>()
    const wrapper = mount(UiButton, { props: { disabled: true }, attrs: { onClick } })
    const button = wrapper.get('button').element
    expect(button.disabled).toBe(true)
    activate(button, 'Enter')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does not submit a surrounding form by default', () => {
    const onSubmit = vi.fn<(event: Event) => void>((event) => event.preventDefault())
    const form = document.createElement('form')
    form.addEventListener('submit', onSubmit)
    document.body.append(form)
    try {
      const wrapper = mount(UiButton, { attachTo: form })
      const button = wrapper.get('button').element
      expect(button.type).toBe('button')
      button.click()
      expect(onSubmit).not.toHaveBeenCalled()
      wrapper.unmount()
    } finally {
      form.remove()
    }
  })

  it.each([
    ['primary', 'bg-accent'],
    ['secondary', 'bg-bg-soft'],
    ['ghost', 'hover:bg-bg-mute'],
    ['danger', 'bg-danger'],
  ] as const)('maps %s to %s', (variant, className) => {
    const wrapper = mount(UiButton, { props: { variant } })
    expect(wrapper.get('button').classes()).toContain(className)
  })

  it('has a visible keyboard focus style', () => {
    const wrapper = mount(UiButton)
    expect(wrapper.get('button').classes()).toContain('focus-visible:outline-accent')
  })
})
