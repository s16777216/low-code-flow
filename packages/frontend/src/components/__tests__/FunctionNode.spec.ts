import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { VueFlow, useVueFlow, Position, type Edge, type Node, type NodeProps } from '@vue-flow/core'
import { UiTooltipProvider } from '@low-code-flow/ui'

import FunctionNode from '../FunctionNode.vue'
import type { SystemType, TypeInfo } from '@/api/types'
import { createCatalog } from '@/domain/catalog'
import type { FlowNodeData } from '@/domain/flow'
import { catalogKey } from '@/domain/injection'

// Vue Flow observes node sizes; jsdom does not provide ResizeObserver.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

const system: SystemType[] = ['string', 'number', 'any'].map((kind) => ({ id: `system:${kind}`, name: kind, rootKind: kind as SystemType['rootKind'], immutable: true }))
const userId: TypeInfo = {
  id: 'user-id',
  kind: 'type',
  name: 'UserId',
  revision: 1,
  updatedAt: '',
  executable: true,
  diagnostics: { errors: 0, warnings: 0 },
  rootKind: 'string',
  ancestry: ['user-id', 'system:string'],
}
const catalog = createCatalog(system, [userId])

const port = (id: string, name: string, typeId: string) => ({ id, name, typeId })
const nodeData = (label: string, inputs: FlowNodeData['inputs'] = [], outputs: FlowNodeData['outputs'] = [], kind: FlowNodeData['kind'] = 'code'): FlowNodeData => ({ kind, label, inputs, outputs })

function mountNodes(nodes: Node<FlowNodeData>[], flowId?: string, edges: Edge[] = []) {
  const Wrapper = defineComponent({
    provide: { [catalogKey as symbol]: ref(catalog) },
    setup() {
      return () =>
        h(UiTooltipProvider, null, () =>
          h(
            VueFlow,
            { ...(flowId ? { id: flowId } : {}), nodes, edges },
            { 'node-function': (props: NodeProps<FlowNodeData>) => h(FunctionNode, props) },
          ),
        )
    },
  })
  return mount(Wrapper, { attachTo: document.body })
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve))
}

describe('FunctionNode', () => {
  const data = nodeData('fn', [port('in-a', 'a', 'system:number'), port('in-b', 'b', 'system:number')], [port('out-sum', 'sum', 'system:number')])
  const single = () => mountNodes([{ id: 'fn', type: 'function', position: { x: 0, y: 0 }, data }])

  it('renders inputs as targets and outputs as sources', async () => {
    const wrapper = single()
    await flush()

    expect(wrapper.find('[data-handleid="in-a"]').classes()).toContain('target')
    expect(wrapper.find('[data-handleid="out-sum"]').classes()).toContain('source')
    wrapper.unmount()
  })

  it('uses the stable port id as handle id and shows the port name', async () => {
    const wrapper = single()
    await flush()

    const handles = wrapper.findAll('.vue-flow__handle')
    expect(handles.map((handle) => handle.attributes('data-handleid'))).toEqual(['in-a', 'in-b', 'out-sum'])
    expect(handles.map((handle) => handle.text())).toEqual(['a', 'b', 'sum'])
    wrapper.unmount()
  })

  it('shows the Type name from the catalog in the port tooltip', async () => {
    const wrapper = mountNodes([{ id: 'fn', type: 'function', position: { x: 0, y: 0 }, data: nodeData('fn', [port('in-id', 'id', 'user-id')]) }])
    await flush()

    await wrapper.find('.input-handle-label').trigger('focus')
    await flush()
    expect(document.body.textContent).toContain('UserId')
    wrapper.unmount()
  })

  it('keeps the handle id when a port is renamed', async () => {
    const node = { id: 'fn', type: 'function', position: { x: 0, y: 0 }, data: nodeData('fn', [port('in-a', 'first', 'system:string')]) }
    const wrapper = mountNodes([node])
    await flush()
    expect(wrapper.find('[data-handleid="in-a"]').text()).toBe('first')
    wrapper.unmount()

    const renamed = mountNodes([{ ...node, data: nodeData('fn', [port('in-a', 'second', 'system:string')]) }])
    await flush()
    expect(renamed.find('[data-handleid="in-a"]').text()).toBe('second')
    renamed.unmount()
  })

  it('uses a different icon for each kind of node', async () => {
    const wrapper = mountNodes(['code', 'function', 'input', 'output'].map((kind, i) => ({ id: kind, type: 'function', position: { x: i * 200, y: 0 }, data: nodeData(kind, [], [], kind as FlowNodeData['kind']) })))
    await flush()
    const icons = wrapper.findAll('.node-function-icon svg').map((svg) => svg.classes().join(' '))
    expect(new Set(icons).size).toBe(4)
    wrapper.unmount()
  })
})

describe('FunctionNode connection highlighting', () => {
  const nodes: Node<FlowNodeData>[] = [
    {
      id: 'producer',
      type: 'function',
      position: { x: 0, y: 0 },
      data: nodeData('producer', [], [port('out-num', 'num', 'system:number'), port('out-text', 'text', 'system:string'), port('out-uid', 'uid', 'user-id')]),
    },
    {
      id: 'consumer',
      type: 'function',
      position: { x: 300, y: 0 },
      data: nodeData(
        'consumer',
        [port('in-num', 'num', 'system:number'), port('in-str', 'str', 'system:string'), port('in-any', 'anything', 'system:any'), port('in-user', 'user', 'user-id')],
        [port('out-str', 'out', 'system:string'), port('out-user', 'who', 'user-id')],
      ),
    },
  ]
  const drag = { nodeId: 'producer', id: 'out-num', type: 'source' as const, position: Position.Right, x: 0, y: 0 }
  const dragInput = { nodeId: 'consumer', id: 'in-num', type: 'target' as const, position: Position.Left, x: 0, y: 0 }

  const mountFlow = (flowId: string, edges: Edge[] = []) => mountNodes(nodes, flowId, edges)

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

  it('accepts a subtype into its base type and rejects the reverse', async () => {
    const wrapper = mountFlow('hl-subtype')
    const flow = useVueFlow('hl-subtype')
    await flush()

    flow.startConnection({ ...drag, id: 'out-uid' })
    await flush()
    expect(state(wrapper, 'in-str')).toEqual({ connectable: true, blocked: false })
    wrapper.unmount()

    const reverse = mountFlow('hl-reverse')
    const reverseFlow = useVueFlow('hl-reverse')
    await flush()
    reverseFlow.startConnection({ ...drag, id: 'out-text' })
    await flush()
    expect(state(reverse, 'in-user')).toEqual({ connectable: false, blocked: true })
    reverse.unmount()
  })

  it('dims an input that already has a producer', async () => {
    const wrapper = mountFlow('hl-taken', [{ id: 'e1', source: 'producer', sourceHandle: 'out-num', target: 'consumer', targetHandle: 'in-num' }])
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
    const wrapper = mountFlow('hl-input-taken', [{ id: 'e1', source: 'producer', sourceHandle: 'out-num', target: 'consumer', targetHandle: 'in-num' }])
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
