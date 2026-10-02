import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import UiTooltip from './UiTooltip.vue'
import UiTooltipProvider from './UiTooltipProvider.vue'

const wrappers: VueWrapper[] = []

afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount())
  wrappers.length = 0
  document.body.innerHTML = ''
})

async function settle() {
  await nextTick()
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

function mountTooltip(contentSlot = false) {
  const container = document.createElement('div')
  document.body.append(container)
  const wrapper = mount(UiTooltipProvider, {
    attachTo: container,
    slots: {
      default: contentSlot
        ? '<UiTooltip side="bottom" :delay="0"><button type="button">Help</button><template #content>Slot help</template></UiTooltip>'
        : '<UiTooltip content="Property help" :delay="0"><button type="button">Help</button></UiTooltip>',
    },
    global: { components: { UiTooltip } },
  })
  wrappers.push(wrapper)
  return wrapper.get('button').element as HTMLButtonElement
}

describe('UiTooltip', () => {
  it.each([
    { slot: false, content: 'Property help' },
    { slot: true, content: 'Slot help' },
  ])('shows $content on keyboard focus and describes the trigger', async ({ slot, content }) => {
    const trigger = mountTooltip(slot)
    trigger.focus()
    await settle()

    const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')
    expect(tooltip).toBeTruthy()
    expect(tooltip?.textContent).toContain(content)
    const describedBy = trigger.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)?.textContent).toContain(content)
  })

  it('hides on Escape while keeping focus on the trigger', async () => {
    const trigger = mountTooltip()
    trigger.focus()
    await settle()
    expect(document.querySelector('[role="tooltip"]')).toBeTruthy()

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
