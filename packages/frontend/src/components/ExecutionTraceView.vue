<script setup lang="ts">
import { CircleCheckIcon, CircleDotIcon, CircleXIcon, ClockIcon, RefreshCwIcon, SquareIcon } from '@lucide/vue'
import { UiBadge, UiCollapsible } from '@low-code-flow/ui'
import type { ExecutionTree, NodeExecution } from '@/api/types'
import type { TypeCatalog } from '@/domain/catalog'
import PortRecordView from './PortRecordView.vue'

defineProps<{ tree: ExecutionTree; catalog: TypeCatalog }>()

const statusIcon = { pending: ClockIcon, running: RefreshCwIcon, success: CircleCheckIcon, failed: CircleXIcon, skipped: CircleDotIcon, cancelled: SquareIcon }
const statusColor: Record<NodeExecution['status'], string> = {
  pending: 'text-fg-muted',
  running: 'text-info animate-spin',
  success: 'text-success',
  failed: 'text-danger',
  skipped: 'text-fg-muted',
  cancelled: 'text-warning',
}
const badgeVariant = { running: 'info', success: 'success', failed: 'danger', cancelled: 'warning' } as const

function duration(start?: string, end?: string) {
  if (!start || !end) return ''
  const ms = Date.parse(end) - Date.parse(start)
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}
</script>

<template>
  <div class="space-y-3 text-sm" :aria-label="`Execution of ${tree.functionName}`">
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-semibold text-heading">{{ tree.functionName }}</span>
      <UiBadge :variant="badgeVariant[tree.status]">{{ tree.status }}</UiBadge>
      <span class="text-xs text-fg-muted">{{ duration(tree.startedAt, tree.completedAt) }}</span>
    </div>
    <p v-if="tree.error" class="text-danger">{{ tree.error.message }}</p>

    <div class="grid gap-3 md:grid-cols-2">
      <section aria-label="Inputs">
        <h4 class="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">Inputs</h4>
        <ul class="space-y-1"><PortRecordView v-for="r in tree.inputs" :key="r.portId" :record="r" :catalog="catalog" /></ul>
        <p v-if="!tree.inputs.length" class="text-xs text-fg-muted">None</p>
      </section>
      <section aria-label="Outputs">
        <h4 class="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">Outputs</h4>
        <ul class="space-y-1"><PortRecordView v-for="r in tree.outputs" :key="r.portId" :record="r" :catalog="catalog" /></ul>
        <p v-if="!tree.outputs.length" class="text-xs text-fg-muted">None</p>
      </section>
    </div>

    <section aria-label="Nodes">
      <h4 class="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">Nodes</h4>
      <ul class="space-y-1">
        <li v-for="node in tree.nodes" :key="node.nodeId" class="rounded-md border border-border px-2 py-1">
          <UiCollapsible :open="node.status === 'failed'">
            <template #trigger>
              <span class="flex items-center gap-2">
                <component :is="statusIcon[node.status]" class="size-4" :class="statusColor[node.status]" :aria-label="node.status" />
                <span class="font-medium">{{ node.nodeName }}</span>
                <span class="text-xs text-fg-muted">{{ node.kind }} · {{ node.status }} {{ duration(node.startedAt, node.completedAt) }}</span>
              </span>
            </template>
            <div class="space-y-2 py-2 pl-2">
              <p v-if="node.error" class="text-danger">{{ node.error.message }}</p>
              <div class="grid gap-2 md:grid-cols-2">
                <ul class="space-y-1" aria-label="Node inputs"><PortRecordView v-for="r in node.inputs" :key="r.portId" :record="r" :catalog="catalog" /></ul>
                <ul class="space-y-1" aria-label="Node outputs"><PortRecordView v-for="r in node.outputs" :key="r.portId" :record="r" :catalog="catalog" /></ul>
              </div>
              <pre v-if="node.logs.length" class="max-h-40 overflow-auto rounded-sm bg-bg-mute p-2 text-xs" aria-label="Logs">{{ node.logs.join('\n') }}</pre>
              <div v-if="node.child" class="border-l-2 border-border pl-3"><ExecutionTraceView :tree="node.child" :catalog="catalog" /></div>
              <p v-else-if="node.childExecutionId" class="text-xs text-fg-muted">The child execution is no longer retained.</p>
            </div>
          </UiCollapsible>
        </li>
      </ul>
    </section>
  </div>
</template>
