import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import UiDialog from './UiDialog.vue'

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

function mountDialog(dismissible = true) {
  const Host = defineComponent({
    components: { UiDialog },
    setup() {
      return { open: ref(false), dismissible }
    },
    template: `
      <div>
        <UiDialog v-model:open="open" title="Edit settings" description="Change the settings" :dismissible="dismissible">
          <template #trigger><button type="button">Edit</button></template>
          <input aria-label="Setting" />
          <template #footer><button type="button">Save</button></template>
        </UiDialog>
        <button type="button" id="outside">Outside</button>
      </div>
    `,
  })
  const container = document.createElement('div')
  document.body.append(container)
  const wrapper = mount(Host, { attachTo: container })
  wrappers.push(wrapper)
  return wrapper.get('button').element as HTMLButtonElement
}

async function openDialog(trigger: HTMLButtonElement) {
  trigger.focus()
  trigger.click()
  await settle()
  return document.querySelector<HTMLElement>('[role="dialog"]')!
}

describe('UiDialog', () => {
  it('moves focus inside and gives the dialog its title as an accessible name', async () => {
    const trigger = mountDialog()
    const dialog = await openDialog(trigger)
    expect(dialog).toBeTruthy()
    expect(dialog.contains(document.activeElement)).toBe(true)
    const title = document.getElementById(dialog.getAttribute('aria-labelledby')!)
    expect(title?.textContent).toBe('Edit settings')
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
  })

  it('cycles Tab and Shift+Tab within the dialog', async () => {
    const trigger = mountDialog()
    const dialog = await openDialog(trigger)
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button, input'))
    expect(focusable.length).toBeGreaterThan(1)

    focusable.at(-1)!.focus()
    focusable.at(-1)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    await settle()
    expect(document.activeElement).toBe(focusable[0])

    focusable[0]!.focus()
    focusable[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    )
    await settle()
    expect(document.activeElement).toBe(focusable.at(-1))
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    const trigger = mountDialog()
    const dialog = await openDialog(trigger)
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('does not close after a pointer down outside when dismissible is false', async () => {
    const trigger = mountDialog(false)
    await openDialog(trigger)
    document
      .getElementById('outside')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await settle()
    expect(document.querySelector('[role="dialog"]')).toBeTruthy()
  })
})
