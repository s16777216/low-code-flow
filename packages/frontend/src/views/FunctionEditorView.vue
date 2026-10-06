<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { Panel, VueFlow, useVueFlow, type Connection, type Edge } from '@vue-flow/core'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { CodeIcon, PlayIcon, SaveIcon, SquareIcon, Trash2Icon, WorkflowIcon, XIcon } from '@lucide/vue'
import { UiBadge, UiBanner, UiButton, UiCollapsible } from '@low-code-flow/ui'
import { ApiError, api } from '@/api/client'
import type { AssetDetail, Diagnostic, ExecutionTree, FunctionDefinition } from '@/api/types'
import DefaultEdge from '@/components/DefaultEdge.vue'
import DiagnosticsList from '@/components/DiagnosticsList.vue'
import ExecutionTraceView from '@/components/ExecutionTraceView.vue'
import FunctionInspector from '@/components/FunctionInspector.vue'
import FunctionNode from '@/components/FunctionNode.vue'
import RunDialog from '@/components/RunDialog.vue'
import { compactInputClass } from '@/components/formClasses'
import { checkConnection } from '@/domain/connection'
import { INPUT_BOUNDARY, OUTPUT_BOUNDARY, fromFlow, projectFunctionNode, toFlow, type FlowNode, type FlowNodeData, type Signature } from '@/domain/flow'
import { useWorkspace } from '@/stores/workspace'

const props = defineProps<{ projectId: string; assetId: string }>()
const workspace = useWorkspace()
const router = useRouter()
const catalog = computed(() => workspace.catalog)
const flowId = `function-${props.assetId}`
const { onConnect, onConnectStart, onConnectEnd, onNodeDoubleClick, addEdges, fitView, screenToFlowCoordinate, getSelectedNodes, getSelectedEdges, removeNodes, removeEdges, addSelectedNodes, removeSelectedNodes, findNode } = useVueFlow(flowId)

const detail = ref<(AssetDetail & { signature: Signature }) | null>(null)
const name = ref('')
const signature = ref<Signature>({ inputs: [], outputs: [] })
const nodes = shallowRef<FlowNode[]>([])
const edges = shallowRef<Edge[]>([])
const baseline = ref('')
const loadError = ref('')
const error = ref('')
const conflict = ref(false)
const referrers = ref<string[]>([])
const saving = ref(false)
const connectionMessage = ref('')
const canvas = ref<HTMLElement>()
const childToAdd = ref('')

const diagnostics = computed<Diagnostic[]>(() => detail.value?.diagnostics ?? [])
const serialized = () => JSON.stringify({ name: name.value, definition: fromFlow(signature.value, nodes.value, edges.value) })
const dirty = computed(() => !!detail.value && serialized() !== baseline.value)
const selectedNode = computed(() => (getSelectedNodes.value[0] as FlowNode | undefined) ?? null)
const otherFunctions = computed(() => workspace.functions.filter((f) => f.id !== props.assetId))

async function load(options: { keepView?: boolean } = {}) {
  loadError.value = ''
  conflict.value = false
  try {
    const [view] = await Promise.all([api.get<AssetDetail & { signature: Signature }>(`/projects/${props.projectId}/functions/${props.assetId}`), workspace.refresh()])
    detail.value = view
    name.value = view.name
    const definition = view.definition as FunctionDefinition
    signature.value = { inputs: definition.inputs ?? [], outputs: definition.outputs ?? [] }
    const flow = toFlow(definition, workspace.signatureOf)
    nodes.value = flow.nodes
    edges.value = flow.edges
    baseline.value = serialized()
    if (!options.keepView) {
      await nextTick()
      await fitView({ padding: 0.2 })
    }
  } catch (e) {
    loadError.value = (e as Error).message
  }
}
void load()

// The boundary nodes show the function's own signature, and function nodes show their child's.
watch(signature, (sig) => {
  nodes.value = nodes.value.map((n) =>
    n.id === INPUT_BOUNDARY ? { ...n, data: { ...n.data!, outputs: sig.inputs } } : n.id === OUTPUT_BOUNDARY ? { ...n, data: { ...n.data!, inputs: sig.outputs } } : n,
  )
}, { deep: true })
watch(() => workspace.functions, () => (nodes.value = nodes.value.map((n) => projectFunctionNode(n, workspace.signatureOf))))

onBeforeRouteLeave(() => !dirty.value || window.confirm('Discard your unsaved changes?'))
const warnUnload = (event: BeforeUnloadEvent) => dirty.value && event.preventDefault()
window.addEventListener('beforeunload', warnUnload)
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnUnload)
  polling.alive = false
})

const check = (connection: Pick<Connection, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>, graphEdges: Edge[] = edges.value) =>
  checkConnection(connection, { nodes: nodes.value, edges: graphEdges }, catalog.value.ancestryOf, catalog.value.name)

const isValidConnection = (connection: Connection, graph: { edges: Edge[] }) => check(connection, graph.edges).valid

onConnect((connection) => {
  connectionMessage.value = ''
  addEdges({ ...connection, id: `${connection.source}.${connection.sourceHandle}->${connection.target}.${connection.targetHandle}` })
})

// Dropping on a handle that cannot accept the connection explains why, instead of silently doing nothing.
let started: { nodeId: string; handleId?: string; handleType?: string } | null = null
onConnectStart(({ nodeId, handleId, handleType }) => {
  connectionMessage.value = ''
  started = { nodeId: nodeId ?? '', handleId: handleId ?? undefined, handleType }
})
onConnectEnd((event) => {
  const handle = (event?.target as Element | null)?.closest?.('.vue-flow__handle')
  const from = started
  started = null
  if (!from || !handle) return
  const other = { nodeId: handle.getAttribute('data-nodeid') ?? '', handleId: handle.getAttribute('data-handleid') }
  const connection =
    from.handleType === 'source'
      ? { source: from.nodeId, sourceHandle: from.handleId ?? null, target: other.nodeId, targetHandle: other.handleId }
      : { source: other.nodeId, sourceHandle: other.handleId, target: from.nodeId, targetHandle: from.handleId ?? null }
  const result = check(connection)
  if (!result.valid) connectionMessage.value = result.reason
})

onNodeDoubleClick(({ node }) => {
  const data = node.data as FlowNodeData | undefined
  if (data?.kind === 'function' && data.functionId) void router.push({ name: 'function', params: { projectId: props.projectId, assetId: data.functionId } })
})

function viewportCenter() {
  const rect = canvas.value?.getBoundingClientRect()
  return screenToFlowCoordinate({ x: (rect?.left ?? 0) + (rect?.width ?? 600) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 400) / 2 })
}

const nextId = (prefix: string) => {
  let n = nodes.value.length
  while (nodes.value.some((node) => node.id === `${prefix}-${n}`)) n++
  return `${prefix}-${n}`
}

async function select(id: string) {
  await nextTick()
  removeSelectedNodes(getSelectedNodes.value)
  const added = findNode(id)
  if (added) addSelectedNodes([added])
}

function addCodeNode() {
  const id = nextId('code')
  nodes.value = [...nodes.value, { id, type: 'function', position: viewportCenter(), data: { kind: 'code', label: `Code ${id.split('-')[1]}`, inputs: [], outputs: [], code: 'return {}' } }]
  void select(id)
}

function addFunctionNode() {
  const child = workspace.functions.find((f) => f.id === childToAdd.value)
  if (!child) return
  const id = nextId('call')
  nodes.value = [...nodes.value, { id, type: 'function', position: viewportCenter(), data: { kind: 'function', label: child.name, inputs: child.signature.inputs, outputs: child.signature.outputs, functionId: child.id } }]
  childToAdd.value = ''
  void select(id)
}

function deleteSelection() {
  removeNodes(getSelectedNodes.value.filter((n) => n.deletable !== false).map((n) => n.id))
  removeEdges(getSelectedEdges.value.map((e) => e.id))
}

function updateNode(id: string, patch: Partial<FlowNodeData>) {
  nodes.value = nodes.value.map((n) => (n.id === id ? { ...n, data: { ...n.data!, ...patch } } : n))
}

async function save() {
  if (!detail.value) return
  saving.value = true
  error.value = ''
  try {
    await api.put(`/projects/${props.projectId}/assets/${props.assetId}`, {
      name: name.value,
      definition: fromFlow(signature.value, nodes.value, edges.value),
      expectedRevision: detail.value.revision,
    })
    // Saving reloads the stored definition; keep what the user was looking at and editing.
    const selected = selectedNode.value?.id
    await load({ keepView: true })
    if (selected) await select(selected)
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) conflict.value = true
    else error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function remove() {
  referrers.value = []
  try {
    await api.delete(`/projects/${props.projectId}/assets/${props.assetId}`)
    baseline.value = serialized()
    await workspace.refresh()
    await router.push({ name: 'project', params: { projectId: props.projectId } })
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      referrers.value = ((e.body.referencedBy as string[]) ?? []).map((id) => workspace.functions.find((f) => f.id === id)?.name ?? id)
    } else error.value = (e as Error).message
  }
}

// Running: start, then poll the in-memory trace until it stops running.
const runOpen = ref(false)
const trace = ref<ExecutionTree | null>(null)
const traceOpen = ref(false)
const runProblems = ref<string[]>([])
const expired = ref(false)
const currentExecution = ref('')
const polling = { alive: true }

async function run(values: Record<string, unknown>) {
  trace.value = null
  expired.value = false
  runProblems.value = []
  traceOpen.value = true
  try {
    const { executionId } = await api.post<{ executionId: string }>(`/projects/${props.projectId}/functions/${props.assetId}/execute`, { inputs: values })
    currentExecution.value = executionId
    while (polling.alive) {
      try {
        trace.value = await api.get<ExecutionTree>(`/executions/${executionId}`)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) expired.value = true
        else throw e
        break
      }
      if (trace.value.status !== 'running') break
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
  } catch (e) {
    if (e instanceof ApiError && e.body.error === 'invalid_input') {
      const ports = e.body.ports as Record<string, string[]>
      runProblems.value = [...Object.entries(ports).map(([port, errors]) => `${port}: ${errors.join('; ')}`), ...((e.body.unknownKeys as string[]) ?? []).map((k) => `unknown input ${k}`)]
    } else if (e instanceof ApiError && e.body.error === 'not_executable') {
      runProblems.value = ((e.body.diagnostics as Diagnostic[]) ?? []).map((d) => d.message)
    } else runProblems.value = [(e as Error).message]
  }
}

const cancel = () => api.post(`/executions/${currentExecution.value}/cancel`).catch(() => undefined)
</script>

<template>
  <div v-if="detail" class="flex h-full flex-col">
    <header class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <WorkflowIcon class="size-4 text-fg-muted" aria-hidden="true" />
      <h1 class="mr-2 text-base font-semibold text-heading">{{ name }}</h1>
      <UiBadge :variant="detail.executable ? 'success' : 'warning'">{{ detail.executable ? 'Executable' : 'Not executable' }}</UiBadge>
      <UiBadge v-if="dirty" variant="info">Unsaved</UiBadge>
      <span class="flex-1" />
      <UiButton variant="secondary" @click="addCodeNode"><CodeIcon class="size-4" aria-hidden="true" /> Code node</UiButton>
      <select v-model="childToAdd" :class="[compactInputClass, 'w-44']" aria-label="Function to call" @change="addFunctionNode">
        <option value="" disabled>Call function...</option>
        <option v-for="fn in otherFunctions" :key="fn.id" :value="fn.id">{{ fn.name }}</option>
      </select>
      <UiButton variant="ghost" aria-label="Delete selection" @click="deleteSelection"><Trash2Icon class="size-4" aria-hidden="true" /></UiButton>
      <UiButton :disabled="!dirty || saving" @click="save"><SaveIcon class="size-4" aria-hidden="true" /> Save</UiButton>
      <UiButton variant="secondary" :disabled="dirty || !detail.executable" :title="dirty ? 'Save before running' : detail.executable ? '' : 'Fix the problems first'" @click="runOpen = true"><PlayIcon class="size-4" aria-hidden="true" /> Run</UiButton>
      <UiButton variant="danger" aria-label="Delete function" @click="remove">Delete</UiButton>
    </header>

    <div class="space-y-2 px-3 pt-2 empty:hidden">
      <UiBanner v-if="conflict" variant="warning">Someone else changed this Function. <UiButton variant="secondary" @click="load()">Reload</UiButton> (your unsaved edits will be lost)</UiBanner>
      <UiBanner v-if="error" variant="danger">{{ error }}</UiBanner>
      <UiBanner v-if="referrers.length" variant="warning">Still used by: {{ referrers.join(', ') }}. Remove those calls first.</UiBanner>
      <UiCollapsible v-if="diagnostics.length">
        <template #trigger><span class="text-warning">{{ diagnostics.length }} problem{{ diagnostics.length > 1 ? 's' : '' }} - saved as a draft, cannot run</span></template>
        <div class="pt-1"><DiagnosticsList :diagnostics="diagnostics" /></div>
      </UiCollapsible>
    </div>

    <div class="flex min-h-0 flex-1">
      <div ref="canvas" class="relative min-w-0 flex-1">
        <VueFlow :id="flowId" v-model:nodes="nodes" v-model:edges="edges" :is-valid-connection="isValidConnection" :delete-key-code="['Backspace', 'Delete']" :min-zoom="0.2">
          <template #node-function="nodeProps"><FunctionNode v-bind="nodeProps" /></template>
          <template #edge-default="edgeProps"><DefaultEdge v-bind="edgeProps" /></template>
          <Panel v-if="connectionMessage" position="top-center" class="max-w-md">
            <UiBanner variant="warning" role="alert">
              <span class="flex items-start gap-2"><span>{{ connectionMessage }}</span><button type="button" aria-label="Dismiss" @click="connectionMessage = ''"><XIcon class="size-4" aria-hidden="true" /></button></span>
            </UiBanner>
          </Panel>
          <MiniMap pannable zoomable />
          <Controls />
        </VueFlow>
      </div>
      <FunctionInspector v-model:name="name" v-model:signature="signature" :project-id="projectId" :node="selectedNode" :catalog="catalog" @update-node="updateNode" />
    </div>

    <section v-if="traceOpen" class="max-h-[45%] min-h-40 overflow-y-auto border-t border-border bg-bg p-3" aria-label="Execution">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-xs font-semibold tracking-wide text-fg-muted uppercase">Execution</h2>
        <div class="flex gap-2">
          <UiButton v-if="trace?.status === 'running'" variant="danger" @click="cancel"><SquareIcon class="size-4" aria-hidden="true" /> Cancel</UiButton>
          <UiButton variant="ghost" aria-label="Close execution" @click="traceOpen = false"><XIcon class="size-4" aria-hidden="true" /></UiButton>
        </div>
      </div>
      <UiBanner variant="info" class="mb-2">Execution traces are kept in memory only. They disappear after a while and when the server restarts.</UiBanner>
      <UiBanner v-if="runProblems.length" variant="danger" class="mb-2"><ul><li v-for="p in runProblems" :key="p">{{ p }}</li></ul></UiBanner>
      <UiBanner v-if="expired" variant="warning" class="mb-2">This execution is no longer available (expired or the server restarted). Run it again.</UiBanner>
      <ExecutionTraceView v-if="trace" :tree="trace" :catalog="catalog" />
      <p v-else-if="!runProblems.length && !expired" class="text-sm text-fg-muted">Starting...</p>
    </section>

    <RunDialog v-model:open="runOpen" :inputs="signature.inputs" :catalog="catalog" @run="run" />
  </div>
  <p v-else-if="loadError" class="p-6 text-sm text-danger">{{ loadError }}</p>
</template>
