import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import type { PortDefinition, SystemType } from '@/api/types'
import { createCatalog } from '@/domain/catalog'
import PortsEditor from '../PortsEditor.vue'

const system: SystemType[] = ['string', 'number'].map((kind) => ({ id: `system:${kind}`, name: kind, rootKind: kind as SystemType['rootKind'], immutable: true }))
const catalog = createCatalog(system, [])
const ports: PortDefinition[] = [
  { id: 'p1', name: 'a', typeId: 'system:string' },
  { id: 'p2', name: 'b', typeId: 'system:number' },
]

function mountEditor(initial = ports) {
  let current = initial
  const wrapper = mount(PortsEditor, {
    props: { modelValue: initial, title: 'Inputs', catalog, baseName: 'input', 'onUpdate:modelValue': (value: PortDefinition[]) => { current = value; void wrapper.setProps({ modelValue: value }) } },
  })
  return { wrapper, value: () => current }
}

describe('PortsEditor', () => {
  it('keeps a port id when it is renamed or retyped', async () => {
    const { wrapper, value } = mountEditor()
    await wrapper.findAll('input[aria-label="Inputs name"]')[0]!.setValue('renamed')
    await wrapper.findAll('select')[0]!.setValue('system:number')
    expect(value()[0]).toEqual({ id: 'p1', name: 'renamed', typeId: 'system:number' })
    expect(value()[1]).toEqual(ports[1])
  })

  it('adds a port with a fresh unique id and name, and removes by id', async () => {
    const { wrapper, value } = mountEditor()
    await wrapper.find('button[aria-label="Add Inputs"]').trigger('click')
    const added = value()[2]!
    expect(ports.map((p) => p.id)).not.toContain(added.id)
    expect(added.name).toBe('input3')
    expect(added.typeId).toBe('system:string')

    await wrapper.find('button[aria-label="Remove a"]').trigger('click')
    expect(value().map((p) => p.id)).toEqual(['p2', added.id])
  })

  it('does not reuse a name that is already taken', async () => {
    const { wrapper, value } = mountEditor([{ id: 'x', name: 'input2', typeId: 'system:string' }])
    await wrapper.find('button[aria-label="Add Inputs"]').trigger('click')
    expect(value().map((p) => p.name)).toEqual(['input2', 'input3'])
  })

  it('flags duplicate names', async () => {
    const { wrapper } = mountEditor([{ id: 'a', name: 'same', typeId: 'system:string' }, { id: 'b', name: 'same', typeId: 'system:string' }])
    expect(wrapper.text()).toContain('Duplicate name')
  })
})
