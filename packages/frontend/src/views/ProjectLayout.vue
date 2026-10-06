<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeftIcon, BoxesIcon, LockIcon, PlusIcon, TriangleAlertIcon, WorkflowIcon } from '@lucide/vue'
import { UiBanner, UiButton, UiCollapsible, UiDialog } from '@low-code-flow/ui'
import { api } from '@/api/client'
import type { AssetDetail } from '@/api/types'
import TypeSelect from '@/components/TypeSelect.vue'
import { inputClass, labelClass } from '@/components/formClasses'
import { catalogKey } from '@/domain/injection'
import { useWorkspace } from '@/stores/workspace'

const props = defineProps<{ projectId: string }>()
const workspace = useWorkspace()
const router = useRouter()
const catalog = computed(() => workspace.catalog)
provide(catalogKey, catalog)

const error = ref('')
const dialogOpen = ref(false)
const creating = ref<'type' | 'function'>('function')
const newName = ref('')
const newParent = ref('system:object')

watch(
  () => props.projectId,
  (id) => workspace.open(id).catch((e: Error) => (error.value = e.message)),
  { immediate: true },
)

function startCreate(kind: 'type' | 'function') {
  creating.value = kind
  newName.value = ''
  newParent.value = 'system:object'
  dialogOpen.value = true
}

async function create() {
  error.value = ''
  const definition = creating.value === 'type' ? { parentTypeId: newParent.value } : { inputs: [], outputs: [], nodes: [], edges: [] }
  try {
    const created = await api.post<AssetDetail>(`/projects/${props.projectId}/assets`, { kind: creating.value, name: newName.value, definition })
    await workspace.refresh()
    dialogOpen.value = false
    await router.push({ name: creating.value, params: { projectId: props.projectId, assetId: created.id } })
  } catch (e) {
    error.value = (e as Error).message
  }
}
</script>

<template>
  <div class="flex h-full">
    <aside class="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-bg-soft p-3 text-sm" aria-label="Project assets">
      <RouterLink to="/" class="mb-3 flex items-center gap-1 text-xs text-fg-muted hover:text-fg"><ArrowLeftIcon class="size-3" aria-hidden="true" /> Projects</RouterLink>
      <RouterLink :to="{ name: 'project', params: { projectId } }" class="mb-4 truncate text-base font-semibold text-heading">{{ workspace.project?.name ?? '...' }}</RouterLink>

      <div class="mb-1 flex items-center justify-between">
        <h2 class="flex items-center gap-1 text-xs font-semibold tracking-wide text-fg-muted uppercase"><WorkflowIcon class="size-3" aria-hidden="true" /> Functions</h2>
        <UiButton variant="ghost" aria-label="New function" @click="startCreate('function')"><PlusIcon class="size-4" aria-hidden="true" /></UiButton>
      </div>
      <ul class="mb-4 space-y-0.5">
        <li v-for="fn in workspace.functions" :key="fn.id">
          <RouterLink :to="{ name: 'function', params: { projectId, assetId: fn.id } }" class="flex items-center justify-between rounded-sm px-2 py-1 hover:bg-bg-mute" active-class="bg-bg-mute font-medium">
            <span class="truncate">{{ fn.name }}</span>
            <TriangleAlertIcon v-if="!fn.executable" class="size-3.5 shrink-0 text-warning" aria-label="Not executable" />
          </RouterLink>
        </li>
      </ul>

      <div class="mb-1 flex items-center justify-between">
        <h2 class="flex items-center gap-1 text-xs font-semibold tracking-wide text-fg-muted uppercase"><BoxesIcon class="size-3" aria-hidden="true" /> Types</h2>
        <UiButton variant="ghost" aria-label="New type" @click="startCreate('type')"><PlusIcon class="size-4" aria-hidden="true" /></UiButton>
      </div>
      <ul class="space-y-0.5">
        <li v-for="type in workspace.types" :key="type.id">
          <RouterLink :to="{ name: 'type', params: { projectId, assetId: type.id } }" class="flex items-center justify-between rounded-sm px-2 py-1 hover:bg-bg-mute" active-class="bg-bg-mute font-medium">
            <span class="truncate">{{ type.name }}</span>
            <TriangleAlertIcon v-if="!type.executable" class="size-3.5 shrink-0 text-warning" aria-label="Not executable" />
          </RouterLink>
        </li>
      </ul>

      <UiCollapsible class="mt-4">
        <template #trigger><span class="flex items-center gap-1 text-xs font-semibold tracking-wide text-fg-muted uppercase"><LockIcon class="size-3" aria-hidden="true" /> System types</span></template>
        <ul class="space-y-0.5 pl-2" aria-label="System types">
          <li v-for="type in workspace.systemTypes" :key="type.id" class="flex items-center gap-1 px-2 py-0.5 text-fg-muted"><LockIcon class="size-3" aria-hidden="true" />{{ type.name }}</li>
        </ul>
        <p class="px-2 pt-1 text-xs text-fg-muted">Built in and read only.</p>
      </UiCollapsible>
    </aside>

    <div class="relative min-w-0 flex-1">
      <UiBanner v-if="error" variant="danger" class="m-3">{{ error }}</UiBanner>
      <RouterView :key="$route.fullPath" />
    </div>

    <UiDialog v-model:open="dialogOpen" :title="creating === 'type' ? 'New type' : 'New function'">
      <form id="new-asset" class="space-y-3" @submit.prevent="create">
        <div>
          <label for="asset-name" :class="labelClass">Name</label>
          <input id="asset-name" v-model="newName" :class="inputClass" required />
        </div>
        <div v-if="creating === 'type'">
          <label :class="labelClass">Inherits from</label>
          <TypeSelect v-model="newParent" :catalog="catalog" :exclude="['system:any']" aria-label="Parent type" />
        </div>
      </form>
      <template #footer>
        <UiButton variant="ghost" @click="dialogOpen = false">Cancel</UiButton>
        <UiButton type="submit" form="new-asset">Create</UiButton>
      </template>
    </UiDialog>
  </div>
</template>
