import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import UiCollapsible from './UiCollapsible.vue'

function activate(button: HTMLButtonElement, key: 'Enter' | ' ') {
  button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }))
  if (key === ' ') button.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key }))
  // jsdom does not perform the browser's default keyboard activation.
  button.click()
}

describe('UiCollapsible', () => {
  it.each(['Enter', ' '] as const)('toggles with %s and updates aria-expanded', async (key) => {
    const Host = defineComponent({
      components: { UiCollapsible },
      setup() {
        return { open: ref(false) }
      },
      template:
        '<UiCollapsible v-model:open="open"><template #trigger>More</template>Content</UiCollapsible>',
    })
    const wrapper = mount(Host)
    const button = wrapper.get('button').element
    const contentId = button.getAttribute('aria-controls')
    expect(button.type).toBe('button')
    expect(contentId).toBeTruthy()
    expect(wrapper.get(`#${contentId}`).attributes('hidden')).toBeDefined()
    expect(button.getAttribute('aria-expanded')).toBe('false')

    activate(button, key)
    await nextTick()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(wrapper.get(`#${contentId}`).attributes('hidden')).toBeUndefined()

    activate(button, key)
    await nextTick()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(wrapper.get(`#${contentId}`).attributes('hidden')).toBeDefined()
  })
})
