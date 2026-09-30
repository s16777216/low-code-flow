import { describe, it, expect, vi } from 'vitest'
import { h } from 'vue'
import { mount } from '@vue/test-utils'
import { VueFlow, type NodeProps } from '@vue-flow/core'

import FunctionNode from '../FunctionNode.vue'
import type { FunctionNode as FunctionNodeData } from '@/types/FunctionNode'

// Vue Flow observes node sizes; jsdom does not provide ResizeObserver.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

function mountFunctionNode(data: FunctionNodeData) {
  return mount(VueFlow, {
    props: {
      nodes: [{ id: 'fn', type: 'function', position: { x: 0, y: 0 }, data }],
    },
    slots: {
      'node-function': (props: NodeProps<FunctionNodeData>) => h(FunctionNode, props),
    },
    attachTo: document.body,
  })
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve))
}

describe('FunctionNode', () => {
  const data: FunctionNodeData = {
    label: 'fn',
    inputs: [
      { id: 'in-a', name: 'a', type: 'number' },
      { id: 'in-b', name: 'b', type: 'number' },
    ],
    outputs: [{ id: 'out-sum', name: 'sum', type: 'number' }],
  }

  it('renders inputs as targets and outputs as sources', async () => {
    const wrapper = mountFunctionNode(data)
    await flush()

    expect(wrapper.find('[data-handleid="in-a"]').classes()).toContain('target')
    expect(wrapper.find('[data-handleid="out-sum"]').classes()).toContain('source')
    wrapper.unmount()
  })

  it('uses the stable port id as handle id and shows the port name', async () => {
    const wrapper = mountFunctionNode(data)
    await flush()

    const handles = wrapper.findAll('.vue-flow__handle')
    expect(handles.map((handle) => handle.attributes('data-handleid'))).toEqual([
      'in-a',
      'in-b',
      'out-sum',
    ])
    expect(handles.map((handle) => handle.text())).toEqual(['a', 'b', 'sum'])
    wrapper.unmount()
  })
})
