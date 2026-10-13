import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import { createCatalog } from '@/domain/catalog'
import RunDialog from '../RunDialog.vue'

const catalog = createCatalog([
  { id: 'system:number', name: 'number', rootKind: 'number', immutable: true },
], [])

async function mountDialog() {
  const wrapper = mount(RunDialog, {
    props: {
      inputs: [
        { id: 'p1', name: 'a', typeId: 'system:number' },
        { id: 'p2', name: 'b', typeId: 'system:number' },
      ],
      catalog,
      open: false,
    },
    global: {
      stubs: {
        UiDialog: { template: '<div><slot /><slot name="footer" /></div>' },
      },
    },
  })
  await wrapper.setProps({ open: true })
  return wrapper
}

describe('RunDialog', () => {
  it.each([[2, 3], [0, -1.25]])('submits numeric inputs %s and %s as numbers', async (a, b) => {
    const wrapper = await mountDialog()
    await wrapper.get('#run-p1').setValue(String(a))
    await wrapper.get('#run-p2').setValue(String(b))
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('run')).toEqual([[{ a, b }]])
    expect(wrapper.emitted('update:open')).toEqual([[false]])
    wrapper.unmount()
  })

  it('shows validation and keeps the dialog open when a number is cleared', async () => {
    const wrapper = await mountDialog()
    await wrapper.get('#run-p1').setValue('2')
    await wrapper.get('#run-p1').setValue('')
    await wrapper.get('#run-p2').setValue('3')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.text()).toContain('Enter a number')
    expect(wrapper.emitted('run')).toBeUndefined()
    expect(wrapper.emitted('update:open')).toBeUndefined()
    wrapper.unmount()
  })
})
