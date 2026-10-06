import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import type { ExecutionTree, NodeExecution, SystemType, TypeInfo } from '@/api/types'
import { createCatalog } from '@/domain/catalog'
import ExecutionTraceView from '../ExecutionTraceView.vue'

const system: SystemType[] = ['string', 'number'].map((kind) => ({ id: `system:${kind}`, name: kind, rootKind: kind as SystemType['rootKind'], immutable: true }))
const userId: TypeInfo = { id: 'user-id', kind: 'type', name: 'UserId', revision: 1, updatedAt: '', executable: true, diagnostics: { errors: 0, warnings: 0 }, rootKind: 'string', ancestry: ['user-id', 'system:string'] }
const catalog = createCatalog(system, [userId])

const record = (portId: string, portName: string, typeId: string, value?: unknown, valueTypeId = typeId) => ({
  portId,
  portName,
  typeId,
  ...(value === undefined ? {} : { value: { typeId: valueTypeId, typeDefinitionHash: 'abcdef0123456789', value } }),
})
const node = (overrides: Partial<NodeExecution>): NodeExecution => ({ nodeId: 'n', nodeName: 'Node', kind: 'code', status: 'success', inputs: [], outputs: [], logs: [], ...overrides })
const tree = (overrides: Partial<ExecutionTree> = {}): ExecutionTree => ({
  id: 'e1',
  functionId: 'f',
  functionName: 'Checkout',
  status: 'success',
  inputs: [record('i', 'userId', 'user-id', 'u-1')],
  outputs: [record('o', 'label', 'system:string', 'U-1')],
  nodes: [],
  definitions: [],
  startedAt: '2026-10-06T00:00:00.000Z',
  completedAt: '2026-10-06T00:00:01.500Z',
  ...overrides,
})

describe('ExecutionTraceView', () => {
  it('shows status, duration, and each port with its Type name, short hash and value', () => {
    const text = mount(ExecutionTraceView, { props: { tree: tree(), catalog } }).text()
    expect(text).toContain('Checkout')
    expect(text).toContain('success')
    expect(text).toContain('1.5 s')
    expect(text).toContain('userId')
    expect(text).toContain('UserId')
    expect(text).toContain('#abcdef01')
    expect(text).toContain('"u-1"')
  })

  it('shows the nominal identity of a value that is a subtype of its port type', () => {
    const subtype = tree({ inputs: [record('i', 'id', 'system:string', 'u-1', 'user-id')] })
    expect(mount(ExecutionTraceView, { props: { tree: subtype, catalog } }).text()).toMatch(/UserId[\s\S]*as string/)
  })

  it('names a Type that no longer exists instead of failing', () => {
    const gone = tree({ inputs: [record('i', 'id', 'deleted-type', 'x')] })
    expect(mount(ExecutionTraceView, { props: { tree: gone, catalog } }).text()).toContain('missing')
  })

  it('shows the error and open details of a failed node, with its port error', () => {
    const failed = tree({
      status: 'failed',
      error: { message: 'Node "Describe" failed: boom' },
      nodes: [node({ nodeName: 'Describe', status: 'failed', error: { message: 'boom' }, outputs: [{ portId: 'o', portName: 'text', typeId: 'system:string', error: 'expected string' }], logs: ['hello'] })],
    })
    const wrapper = mount(ExecutionTraceView, { props: { tree: failed, catalog } })
    expect(wrapper.text()).toContain('Node "Describe" failed: boom')
    expect(wrapper.text()).toContain('expected string')
    expect(wrapper.find('pre[aria-label="Logs"]').text()).toBe('hello')
  })

  it('renders a nested child execution recursively', () => {
    const child = tree({ id: 'e2', functionName: 'ChildFn', outputs: [record('co', 'label', 'system:string', 'CHILD')] })
    const parent = tree({ nodes: [node({ kind: 'function', nodeName: 'Call', childExecutionId: 'e2', child })] })
    const text = mount(ExecutionTraceView, { props: { tree: parent, catalog } }).text()
    expect(text).toContain('ChildFn')
    expect(text).toContain('"CHILD"')
  })

  it('says so when a child execution is no longer retained', () => {
    const parent = tree({ nodes: [node({ kind: 'function', nodeName: 'Call', childExecutionId: 'evicted' })] })
    expect(mount(ExecutionTraceView, { props: { tree: parent, catalog } }).text()).toContain('no longer retained')
  })
})
