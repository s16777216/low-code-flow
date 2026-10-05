import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { VueFlow, useVueFlow, Position, type Edge, type Node, type NodeProps } from '@vue-flow/core'
import { UiTooltipProvider } from '@low-code-flow/ui'

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
  const Wrapper = defineComponent({
    setup() {
      return () =>
        h(UiTooltipProvider, null, () =>
          h(VueFlow, {
            nodes: [{ id: 'fn', type: 'function', position: { x: 0, y: 0 }, data }],
          }, {
            'node-function': (props: NodeProps<FunctionNodeData>) => h(FunctionNode, props),
          }),
        )
    },
  })

  return mount(Wrapper, { attachTo: document.body })
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

  it('uses the stable port id as handle id and shows the port name and type', async () => {
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

describe('FunctionNode connection highlighting', () => {
  const nodes: Node<FunctionNodeData>[] = [
    {
      id: 'producer',
      type: 'function',
      position: { x: 0, y: 0 },
      data: {
        label: 'producer',
        outputs: [
          { id: 'out-num', name: 'num', type: 'number' },
          { id: 'out-text', name: 'text', type: 'string' },
        ],
      },
    },
    {
      id: 'consumer',
      type: 'function',
      position: { x: 300, y: 0 },
      data: {
        label: 'consumer',
        inputs: [
          { id: 'in-num', name: 'num', type: 'number' },
          { id: 'in-str', name: 'str', type: 'string' },
          { id: 'in-any', name: 'anything', type: 'any' },
        ],
        outputs: [{ id: 'out-str', name: 'out', type: 'string' }],
      },
    },
  ]
  const drag = { nodeId: 'producer', id: 'out-num', type: 'source' as const, position: Position.Right, x: 0, y: 0 }
  const dragInput = { nodeId: 'consumer', id: 'in-num', type: 'target' as const, position: Position.Left, x: 0, y: 0 }

  function mountFlow(flowId: string, edges: Edge[] = []) {
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h(UiTooltipProvider, null, () =>
            h(VueFlow, { id: flowId, nodes, edges }, {
              'node-function': (props: NodeProps<FunctionNodeData>) => h(FunctionNode, props),
            }),
          )
      },
    })
    return mount(Wrapper, { attachTo: document.body })
  }

  function state(wrapper: ReturnType<typeof mountFlow>, handleId: string) {
    const classes = wrapper.find(`[data-handleid="${handleId}"]`).classes()
    return { connectable: classes.includes('is-connectable'), blocked: classes.includes('is-blocked') }
  }

  it('marks nothing before a connection starts', async () => {
    const wrapper = mountFlow('hl-idle')
    await flush()

    expect(state(wrapper, 'in-num')).toEqual({ connectable: false, blocked: false })
    wrapper.unmount()
  })

  it('highlights inputs that accept the dragged output and dims the rest', async () => {
    const wrapper = mountFlow('hl-drag')
    const flow = useVueFlow('hl-drag')
    await flush()

    flow.startConnection(drag)
    await flush()

    expect(state(wrapper, 'in-num')).toEqual({ connectable: true, blocked: false })
    expect(state(wrapper, 'in-any')).toEqual({ connectable: true, blocked: false })
    expect(state(wrapper, 'in-str')).toEqual({ connectable: false, blocked: true })
    wrapper.unmount()
  })

  it('dims an input that already has a producer', async () => {
    const wrapper = mountFlow('hl-taken', [
      { id: 'e1', source: 'producer', sourceHandle: 'out-num', target: 'consumer', targetHandle: 'in-num' },
    ])
    const flow = useVueFlow('hl-taken')
    await flush()

    flow.startConnection(drag)
    await flush()

    expect(state(wrapper, 'in-num')).toEqual({ connectable: false, blocked: true })
    wrapper.unmount()
  })

  it('clears the highlight when the connection ends', async () => {
    const wrapper = mountFlow('hl-end')
    const flow = useVueFlow('hl-end')
    await flush()

    flow.startConnection(drag)
    await flush()
    flow.endConnection()
    await flush()

    expect(state(wrapper, 'in-num')).toEqual({ connectable: false, blocked: false })
    wrapper.unmount()
  })

  it('does not mark inputs when the drag starts from an input', async () => {
    const wrapper = mountFlow('hl-input')
    const flow = useVueFlow('hl-input')
    await flush()

    flow.startConnection(dragInput)
    await flush()

    expect(state(wrapper, 'in-str')).toEqual({ connectable: false, blocked: false })
    wrapper.unmount()
  })

  it('highlights outputs that can feed the dragged input and dims the rest', async () => {
    const wrapper = mountFlow('hl-from-input')
    const flow = useVueFlow('hl-from-input')
    await flush()

    flow.startConnection(dragInput)
    await flush()

    expect(state(wrapper, 'out-num')).toEqual({ connectable: true, blocked: false })
    expect(state(wrapper, 'out-text')).toEqual({ connectable: false, blocked: true })
    wrapper.unmount()
  })

  it('dims outputs of the dragged input node because they would form a cycle', async () => {
    const wrapper = mountFlow('hl-self')
    const flow = useVueFlow('hl-self')
    await flush()

    flow.startConnection({ ...dragInput, id: 'in-str' })
    await flush()

    expect(state(wrapper, 'out-text')).toEqual({ connectable: true, blocked: false })
    expect(state(wrapper, 'out-str')).toEqual({ connectable: false, blocked: true })
    wrapper.unmount()
  })

  it('dims every output when the dragged input already has a producer', async () => {
    const wrapper = mountFlow('hl-input-taken', [
      { id: 'e1', source: 'producer', sourceHandle: 'out-num', target: 'consumer', targetHandle: 'in-num' },
    ])
    const flow = useVueFlow('hl-input-taken')
    await flush()

    flow.startConnection(dragInput)
    await flush()

    expect(state(wrapper, 'out-num')).toEqual({ connectable: false, blocked: true })
    expect(state(wrapper, 'out-text')).toEqual({ connectable: false, blocked: true })
    wrapper.unmount()
  })

  it('clears output highlighting when an input-initiated connection ends', async () => {
    const wrapper = mountFlow('hl-input-end')
    const flow = useVueFlow('hl-input-end')
    await flush()

    flow.startConnection(dragInput)
    await flush()
    flow.endConnection()
    await flush()

    expect(state(wrapper, 'out-num')).toEqual({ connectable: false, blocked: false })
    wrapper.unmount()
  })
})
